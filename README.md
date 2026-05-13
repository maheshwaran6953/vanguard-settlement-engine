# Vanguard Settlement Engine

> An enterprise-grade B2B invoice financing platform that eliminates the
> working capital gap for SMEs by providing instant, risk-assessed advances
> against buyer-approved invoices.

[![CI](https://github.com/maheshwaran6953/vanguard-settlement-engine/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/maheshwaran6953/vanguard-settlement-engine/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-86%20passing-brightgreen)](https://github.com/maheshwaran6953/vanguard-settlement-engine/actions)
[![Coverage](https://img.shields.io/badge/coverage-67%25-yellow)](https://github.com/maheshwaran6953/vanguard-settlement-engine/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Containerised-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Instrumented-000000?logo=opentelemetry)](https://opentelemetry.io/)

---

## The Problem

Indian SMEs face a structural cash flow crisis: a supplier like **Alpha Tech**
delivers goods to a large buyer like **Zoho**, issues a ₹10,00,000 invoice,
and then waits **90 days** to be paid. During that 90-day window, Alpha Tech
cannot pay its own suppliers, meet payroll, or take on new orders.

Traditional bank financing is slow (7–14 days), paper-heavy, and unavailable
to businesses without three years of ITR filings.

**Vanguard bridges this gap** by advancing funds against verified,
buyer-approved invoices within hours — not weeks.

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker Desktop

### Setup

```bash
# 1. Clone and install
git clone https://github.com/maheshwaran6953/vanguard-settlement-engine.git
cd vanguard-settlement-engine
npm install

# 2. Start all services (PostgreSQL, Redis, Jaeger, Mailpit)
docker-compose up -d

# 3. Configure environment
cp infra/config/.env.development infra/config/.env.local
# Edit .env.local with your secrets

# 4. Start the HTTP server
npm run dev

# 5. Start the background worker (separate terminal)
npm run worker:dev
```

### Explore the API

Open **http://localhost:3000/docs** — Swagger UI with all endpoints documented
and executable from the browser.

Import `docs/vanguard-collection.json` into Postman to run the complete
19-request lifecycle end-to-end.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (Express)                       │
│   helmet · JWT Auth · Zod Validation · RBAC · Rate Limiting     │
│   Idempotency Keys · Webhook HMAC Verification                  │
└──────────┬──────────────────┬──────────────────┬────────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼──────┐
    │   Invoice   │   │     VAN      │   │    Risk     │
    │   Service   │   │   Service    │   │   Engine    │
    │             │   │              │   │             │
    │ State       │   │ Idempotent   │   │ Three-Way   │
    │ Machine     │   │ Ledger       │   │ Match +     │
    │ + Event     │   │ + Auto       │   │ Anomaly     │
    │ Sourcing    │   │ Settlement   │   │ Detection   │
    └──────┬──────┘   └───────┬──────┘   └──────┬──────┘
           │                  │                 │
    ┌──────▼──────────────────▼─────────────────▼───────┐
    │                  PostgreSQL 16                    │
    │  invoices · virtual_accounts · ledger_entries     │
    │  invoice_events (append-only, REVOKE UPDATE)      │
    │  idempotency_keys · organisation_credentials      │
    └───────────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────┐
    │           Async Infrastructure                      │
    │   BullMQ + Redis — notification & document queues   │
    │   Nodemailer → Mailpit (dev) / SMTP (prod)          │
    │   PDFKit → settlement receipt generation            │
    └─────────────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────┐
    │           Observability                             │
    │   pino structured JSON logging                      │
    │   OpenTelemetry auto-instrumented traces            │
    │   Trace-log correlation (trace_id on every line)    │
    │   Jaeger UI → http://localhost:16686                │
    └─────────────────────────────────────────────────────┘
```

---

## Engineering Highlights

### 1. Idempotent Ledger — Defence-in-Depth

Bank webhooks fire twice, arrive out of order, and retry on timeout.
A naive implementation double-credits the supplier.

This platform implements **two independent guards**:

**Layer 1 — Application check:** Before opening a transaction, the service
queries existing ledger entries and compares idempotency keys. Cheap,
lock-free, handles the common case.

**Layer 2 — Database constraint:** `UNIQUE` on `ledger_entries.idempotency_key`
is the physical last line of defence. Two concurrent webhooks → one INSERT
succeeds, one gets `PG 23505`, caught and returned as 200 to the bank.

**HTTP-level idempotency:** `POST /invoices` supports the `Idempotency-Key`
header. Retrying a timed-out request returns the cached response without
creating a duplicate invoice. Keys stored in PostgreSQL for durability.

### 2. Three-Layer Risk Engine

Before the platform commits capital, every invoice passes three independent
verification layers — implemented as **pure functions** (no database calls,
no side effects, independently unit-testable):

| Layer | Check | Hard Gate? |
|-------|-------|-----------|
| Three-Way Match | Invoice vs PO vs Delivery Receipt (±2% variance) | Yes — instant reject |
| Anomaly Detection | Amount spikes, short payment terms, fraud signals | Configurable threshold |
| Buyer Risk Score | Default history, credit utilisation, payment recency | Auto-reject above 75/100 |

### 3. Event Sourcing for Compliance

Every state change writes an immutable event to `invoice_events` before
the status column is updated — both in a single `BEGIN/COMMIT` transaction.

```sql
-- The DB physically enforces immutability
REVOKE UPDATE, DELETE ON invoice_events FROM PUBLIC;
```

If a regulator asks why invoice INV-2026-001 was funded, the complete
decision trail — three-way match result, anomaly score, buyer risk score,
actor identity, timestamp — is recoverable from the event log.

### 4. State Machine Enforcement

```
DRAFT → SUBMITTED → BUYER_APPROVED → FINANCING_REQUESTED → FUNDED → REPAID
                                                          ↘ DEFAULTED
                         (any pre-funded state) → CANCELLED
```

Invalid transitions return `409 INVALID_TRANSITION` before the database
is touched. Exhaustively tested with 34 unit tests covering every valid
path, every skip-ahead attempt, every backward transition, and every
self-transition on all 8 states.

### 5. Trace-Log Correlation

Every log line carries the OpenTelemetry `trace_id` of the active request.
In an incident: paste the `trace_id` into Jaeger for the full distributed
trace with timing, paste it into your log aggregator for the human-readable
narrative.

```json
{
  "level": "info",
  "component": "InvoiceService",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "invoice_id": "3f2a...",
  "msg": "Invoice submitted successfully"
}
```

### 6. Webhook HMAC-SHA256 Verification

`POST /vans/webhook/payment` requires an `X-Webhook-Signature` header
containing `HMAC-SHA256(secret, raw_body)`. The raw body is captured
before `express.json()` parses it. Signature comparison uses
`crypto.timingSafeEqual` to prevent timing attacks.

---

## Technology Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Runtime | Node.js 20 + TypeScript 5 (strict) | Type safety on financial data |
| Framework | Express 5 | Minimal, explicit, production-proven |
| Database | PostgreSQL 16 (Docker) | ACID compliance, JSONB event store |
| Cache / Queue | Redis 7 + BullMQ | Async job processing, idempotency |
| Validation | Zod | Runtime schema enforcement |
| Auth | JWT + bcrypt | Stateless, role-bearing tokens |
| Logging | pino + pino-http | Structured JSON, lowest overhead |
| Tracing | OpenTelemetry SDK | Vendor-neutral distributed tracing |
| Email (dev) | Nodemailer → Mailpit | Local SMTP capture at localhost:8025 |
| PDF | PDFKit | Settlement receipt generation |
| API Docs | Swagger UI (OpenAPI 3.0) | Interactive at /docs |
| Security | helmet, express-rate-limit | OWASP headers, brute-force protection |
| Testing | Jest + supertest | 86 tests (60 unit + 26 integration) |
| CI/CD | GitHub Actions | Automated on every PR and push |
| Architecture | Clean Architecture (Core/Services/Infra) | Testable, dependency-inverted |

---

## Project Structure

```
vanguard-settlement-engine/
├── core/
│   ├── config/          # Environment validation (Zod, fast-fail on boot)
│   ├── database/        # Pool, DI container
│   ├── domain/          # Entity types, auth types
│   ├── repositories/    # Data access (interfaces + SQL implementations)
│   ├── services/
│   │   ├── invoice/     # State machine (extracted, independently testable)
│   │   ├── risk/        # Three-layer risk engine (pure functions)
│   │   ├── invoice.service.ts
│   │   ├── van.service.ts
│   │   ├── auth.service.ts
│   │   └── risk/
│   └── utils/           # Logger (pino + OTel mixin)
├── services/
│   ├── middleware/      # Auth, RBAC, idempotency, rate limiting,
│   │                    # webhook auth, error handler, request logger
│   ├── routes/          # HTTP layer (invoice, van, risk, auth, admin, health)
│   ├── app.ts           # Express factory (buildApp) + Swagger UI
│   └── server.ts        # Entry point — owns OTel initialisation order
├── infra/
│   ├── config/          # Environment files (.env.development, .env.test)
│   ├── db/migrations/   # V001–V004 versioned SQL migrations
│   ├── email/           # Nodemailer + HTML templates
│   ├── pdf/             # PDFKit receipt generator
│   ├── queue/           # BullMQ queues, worker, job handlers
│   └── telemetry/       # OpenTelemetry SDK initialisation
├── tests/
│   ├── unit/            # 60 pure function tests (risk engine + state machine)
│   └── integration/     # 26 real-database tests (lifecycle + resilience)
├── docs/
│   ├── adr/             # ADR-0001 through ADR-0007
│   ├── openapi.yaml     # OpenAPI 3.0 spec
│   ├── vanguard-collection.json    # Postman collection (19 chained requests)
│   └── vanguard-environment.json  # Postman environment
├── scripts/
│   └── sign-webhook.js  # HMAC signing utility for manual webhook testing
├── docker-compose.yml   # PostgreSQL, Redis, Jaeger, Mailpit
└── .github/workflows/
    └── ci.yml           # CI pipeline with service containers
```

---

## API Reference

Full documentation at **http://localhost:3000/docs** (Swagger UI).

### Invoice Lifecycle

```
POST   /auth/register                   Register supplier or buyer organisation
POST   /auth/login                      Authenticate, receive JWT

POST   /invoices                        Submit invoice (supplier, Idempotency-Key supported)
GET    /invoices/:id                    Get invoice with full audit trail
POST   /invoices/:id/approve            Buyer digitally approves invoice
POST   /invoices/:id/request-financing  Supplier requests advance

POST   /risk/assess                     Run three-layer risk assessment

POST   /vans                            Create Virtual Account Number
POST   /vans/webhook/payment            Bank payment notification (HMAC-secured)
GET    /vans/:invoiceId                 Reconciliation view with ledger entries

GET    /admin/failed-jobs               List failed background jobs (platform_admin)
POST   /admin/failed-jobs/:q/:id/retry  Retry a specific failed job
DELETE /admin/failed-jobs/:q/:id        Discard a failed job

GET    /health                          Service health check
GET    /docs                            Swagger UI
```

### Error Response Shape

Every error returned by this API has an identical structure:

```json
{
  "success": false,
  "error": {
    "code":    "INVALID_TRANSITION",
    "message": "Invalid status transition: BUYER_APPROVED → SUBMITTED"
  }
}
```

---

## Architecture Decision Records

| ADR | Decision | Status |
|-----|---------|--------|
| [ADR-0001](docs/adr/ADR-0001-tech-stack.md) | TypeScript + Node.js + PostgreSQL | Accepted |
| [ADR-0002](docs/adr/ADR-0002-event-sourcing.md) | Event sourcing for invoice audit trail | Accepted |
| [ADR-0003](docs/adr/ADR-0003-idempotent-ledger.md) | Defence-in-depth idempotency | Accepted |
| [ADR-0004](docs/adr/ADR-0004-three-way-match.md) | Three-layer risk engine architecture | Accepted |
| [ADR-0005](docs/adr/ADR-0005-opentelemetry.md) | OpenTelemetry for observability | Accepted |
| [ADR-0006](docs/adr/ADR-0006-resilience.md) | Rate limiting, webhook auth, idempotency keys | Accepted |
| [ADR-0007](docs/adr/ADR-0007-async-jobs.md) | BullMQ async job architecture | Accepted |

---

## Testing

```bash
npm run test:unit         # 60 unit tests — pure functions, sub-second
npm run test:integration  # 26 integration tests — real PostgreSQL
npm test                  # All 86 tests
npm run test:coverage     # Full suite with coverage report
```

**Unit tests** cover the risk engine (26 tests across all three layers and
boundary conditions) and the invoice state machine (34 tests covering every
valid transition, every invalid skip-ahead, every terminal state, and every
backward transition).

**Integration tests** run against a real PostgreSQL database (no mocks for
the data layer). They cover the complete financial lifecycle, RBAC enforcement,
state machine validation, idempotency middleware, webhook authentication bypass
in test mode, and all six security headers set by helmet.

---

## Development Services

| Service | URL | Purpose |
|---------|-----|---------|
| API | http://localhost:3000 | HTTP server |
| Swagger UI | http://localhost:3000/docs | Interactive API docs |
| Mailpit | http://localhost:8025 | Capture outgoing emails |
| Jaeger | http://localhost:16686 | Distributed trace visualisation |
| PostgreSQL | localhost:5432 | Primary database |
| Redis | localhost:6379 | Job queue and idempotency store |

---

## GitFlow & Standards

All work developed on feature branches, merged via pull requests into
`develop`, promoted to `main` for releases. Branch protection requires
CI to pass before any merge.

Conventional commits throughout: `feat:`, `fix:`, `docs:`, `test:`,
`chore:`.

ADRs document every significant architectural decision, including the
rationale and alternatives considered.