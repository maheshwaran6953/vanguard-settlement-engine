# ADR-0007: Asynchronous Job Architecture with BullMQ

**Date:** 2026-04-12
**Status:** Accepted
**Deciders:** Engineering Lead

---

## Context

Several operations in the invoice financing lifecycle are too slow or
too unreliable to run synchronously inside an HTTP request handler:

- **Email notifications** — SMTP delivery can take 200ms–2s and fails
  if the mail server is temporarily unavailable
- **PDF generation** — PDFKit renders synchronously on the CPU thread;
  generating a multi-page receipt blocks the event loop for 50–200ms
- **Credit bureau checks** — external API calls with unpredictable
  latency and rate limits (planned for Phase 5)

Running these operations synchronously would mean:

- HTTP response times spike to 2s+ on approval and settlement endpoints
- A failed email send rolls back a successful invoice approval
- A downed mail server blocks all invoice processing

The solution is a persistent, retriable job queue that decouples
HTTP response time from background I/O operations.

---

## Decision

We use **BullMQ** with **Redis** as the job queue infrastructure,
running workers in a **separate Node.js process** from the HTTP server.

---

## Technology Choice: BullMQ over Alternatives

### BullMQ (chosen)

BullMQ is a Redis-backed job queue built on ioredis with first-class
TypeScript support. It provides atomic job state transitions using
Redis Lua scripts, preventing double-processing under concurrent workers.

Chosen because:
- **Infrastructure fit**: Redis was already introduced for future
  idempotency key caching. Adding BullMQ has zero marginal
  infrastructure cost.
- **TypeScript native**: Job payload types are enforced at compile time.
  A mismatched payload between producer and consumer is a build error,
  not a runtime surprise.
- **Operational maturity**: Provides built-in retry with exponential
  backoff, dead letter visibility, job deduplication via `jobId`, and
  a programmatic API for inspecting and retrying failed jobs.
- **Process model fit**: BullMQ workers are long-running Node processes,
  matching our existing runtime. No additional language runtime required.

### AWS SQS (rejected)

SQS is a managed queue service that eliminates Redis operational burden.
Rejected for the MVP because:
- Requires AWS credentials, IAM policies, and VPC configuration —
  significant setup overhead for a development project
- Per-message pricing adds cost unpredictability during load testing
- Local development requires LocalStack or mocked clients, adding
  testing complexity
- Migration path from BullMQ to SQS is straightforward if the platform
  scales to require managed infrastructure

### pg-boss (rejected)

pg-boss uses PostgreSQL as the job store, eliminating the Redis
dependency entirely. Rejected because:
- Job polling acquires advisory locks on PostgreSQL, adding read load
  to the primary database that handles all financial transactions
- PostgreSQL is not optimised for high-frequency job polling — at scale
  this creates lock contention with invoice and ledger writes
- Mixing job queue state with financial state in one database complicates
  backup, restore, and point-in-time recovery procedures

### Agenda (rejected)

Agenda is a MongoDB-backed job scheduler. Rejected immediately because:
- Introduces a third database technology (PostgreSQL + Redis + MongoDB)
  with no compensating benefit
- The project has no MongoDB expertise or existing infrastructure

---

## Queue Design: Three Named Queues

Jobs are separated into three queues by domain rather than using a
single unified queue. This is a deliberate separation of concerns.

notification.queue   Email delivery — variable latency, external dependency
document.queue       PDF generation — CPU-bound, local filesystem
risk.queue           Credit bureau calls — rate-limited external API (Phase 5)

**Why separate queues rather than one queue with job types?**

Each queue has different operational characteristics:

| Queue | Concurrency | Failure impact | Scale trigger |
|-------|-------------|----------------|---------------|
| notification | Low (1–3) | Email delayed | High approval volume |
| document | Low (1–2) | PDF delayed | High settlement volume |
| risk | Very low (1) | Risk check delayed | External API rate limit |

Separate queues allow independent concurrency tuning, independent retry
policies, and independent worker scaling without affecting each other.
If the credit bureau API starts rate-limiting at Phase 5, we can pause
the risk queue without affecting email delivery.

A single queue with all job types would require complex routing logic
and prevent independent scaling of each concern.

**Job deduplication via jobId**

Every enqueued job uses a deterministic `jobId`:

```typescript
{ jobId: `invoice-approved-${invoice.id}` }
{ jobId: `receipt-${invoice.id}` }
```

If the HTTP server enqueues the same job twice (e.g. due to a retry
in the service layer), BullMQ ignores the duplicate. This provides
at-most-once enqueue semantics at the application level, complementing
the at-least-once delivery guarantee that Redis provides.

---

## Resilience Strategy

### Retry policy

Every queue uses exponential backoff with three attempts:

```typescript
attempts: 3,
backoff: { type: 'exponential', delay: 2000 },
```

| Attempt | Delay before retry | Cumulative wait |
|---------|--------------------|-----------------|
| 1 (immediate) | — | 0s |
| 2 | 2 seconds | 2s |
| 3 | 4 seconds | 6s |

Three attempts covers the common failure modes:

- Transient SMTP connection refused (Mailpit restart, mail server blip)
- Brief Redis connectivity interruption
- Filesystem write contention on the PDF storage directory

Three attempts is deliberately conservative. A job that fails three
times in six seconds has a structural problem (wrong credentials,
unreachable host, invalid payload) that requires human intervention —
not more retries.

### Dead letter queue

After three failed attempts, BullMQ moves the job to the `failed`
state in Redis. The job is retained for 7 days:

```typescript
removeOnFail: { age: 7 * 86_400 }
```

The platform exposes three admin endpoints for operational management:

GET    /admin/failed-jobs              List all failed jobs across queues
POST   /admin/failed-jobs/:queue/:id/retry   Retry a specific job
DELETE /admin/failed-jobs/:queue/:id         Discard a job permanently

All admin endpoints require the `platform_admin` role enforced via
the existing RBAC middleware. No direct Redis access is required for
routine job recovery operations.

**Operational runbook (abbreviated):**

1. Alert fires on failed job count exceeding threshold
2. Engineer calls `GET /admin/failed-jobs` to identify the failure
3. Engineer reads `failed_reason` to determine root cause
4. Engineer fixes the underlying issue (restarts mail server, fixes
   credentials, clears disk space)
5. Engineer calls `POST .../retry` to replay the job
6. Engineer confirms success via worker logs and Mailpit inbox

### Completed job retention

Completed jobs are retained for 24 hours with a maximum of 100 entries:

```typescript
removeOnComplete: { age: 86_400, count: 100 }
```

This allows post-hoc debugging of recently completed jobs without
accumulating unbounded Redis memory usage.

---

## Process Isolation: Worker as a Separate Process

The worker runs as a completely independent Node.js process:

```bash
# HTTP server
ts-node services/server.ts

# Worker process (separate terminal / container)
ts-node infra/queue/worker.ts
```

**Why not run the worker inside the HTTP server process?**

Three reasons:

**1. Fault isolation.** If the PDF generation handler throws an
unhandled exception and crashes the process, only the worker dies.
The HTTP server continues serving requests. Invoice submission,
approval, and risk assessment are unaffected. In a single-process
design, a worker crash takes down the API entirely.

**2. Resource management.** PDFKit renders synchronously on the CPU
thread. In a single-process design, generating a PDF blocks the Node.js
event loop and degrades HTTP response times for all concurrent requests.
In a separate process, the worker's CPU usage is completely isolated
from the HTTP server's event loop.

**3. Independent scaling.** In production Kubernetes deployment, the
HTTP server and worker are separate Deployments with independent
replica counts. During a settlement spike (month-end batch), the
document worker can scale to 3 replicas while the HTTP server stays
at 2. This is impossible in a single-process model.

**Shared state: Redis only**

The HTTP server and worker share no in-process state. The only
communication channel is Redis. This means:

- Worker restarts do not require HTTP server restarts
- Multiple worker replicas can process the same queues without
  coordination (BullMQ handles locking atomically in Redis)
- The worker can be deployed to a different host or container entirely

---

## Consequences

**Positive:**
- HTTP response times on approval and settlement endpoints are
  decoupled from email and PDF I/O — consistently under 100ms
- Email and PDF failures do not roll back successful financial
  state transitions
- Failed jobs are visible and recoverable without Redis CLI access
- Worker can be scaled independently of the HTTP API

**Negative:**
- Email and PDF delivery is eventually consistent — there is a window
  between invoice approval and email delivery (typically 1–3 seconds)
- Requires Redis as an additional infrastructure dependency. Redis
  availability is now required for job enqueueing (if Redis is down,
  job addition will throw — mitigated by the queue's retry connection
  logic in `redis-connection.ts`)
- Worker process must be started separately in development. Developers
  who forget to run `npm run worker:dev` will not see emails or PDFs
  during local testing

## Future Considerations

- **Phase 5**: The `risk.queue` will be activated for async credit
  bureau API calls, reducing the risk assessment HTTP response time
- **Production**: Replace `SimpleSpanProcessor` with `BatchSpanProcessor`
  in the worker's OpenTelemetry setup for throughput efficiency
- **Scale**: If Redis becomes a single point of failure concern,
  migrate to Redis Cluster or replace BullMQ with SQS — the
  `IJobHandler` interface ensures job handlers require no changes