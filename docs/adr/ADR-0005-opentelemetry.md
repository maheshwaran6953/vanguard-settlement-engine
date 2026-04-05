# ADR-0005: OpenTelemetry for Observability

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** Engineering Lead

---

## Context

A financial platform processes requests that span multiple services,
multiple database queries, and potentially external API calls (credit
bureaus, banking partners). When a transaction fails or is slow, the
on-call engineer needs to answer:

- Which service caused the failure?
- Which database query was slow?
- What was the full request context at the time?

Logs alone cannot answer these questions reliably — a log line saying
"payment failed" with no request context requires reconstructing the
call chain manually. Traces alone are hard to read without the
human-readable log narrative alongside them.

## Decision

We implement **trace-log correlation** using:

- **OpenTelemetry SDK** for distributed tracing (auto-instrumented)
- **pino** for structured JSON logging
- **A custom mixin** that injects `trace_id` and `span_id` into every log line

### Initialisation Order

The OTel SDK patches Node.js module internals at load time. If any
instrumented module (Express, pg, http) loads before the SDK initialises,
it will never be traced.

We enforce correct initialisation order structurally:
services/server.ts          ← entry point, owns import order
import '../infra/telemetry/tracing'   ← 1. OTel patches Node internals
import { logger }                     ← 2. Logger (uses OTel API for mixin)
import { buildApp }                   ← 3. Express (already instrumented)

The server entry point and the app factory are separate files. A developer
cannot reorder imports in `app.ts` and silently break tracing.

### Trace-Log Correlation
```typescript
mixin() {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}
```

Every log line produced anywhere in the application automatically carries
the `trace_id` of the active OTel span. In an incident:

1. Find the error in your log aggregator by message or level
2. Copy the `trace_id` from that log line
3. Paste it into Jaeger — see the full distributed trace with timing
4. Every log line from that same request shares the same `trace_id`

### Vendor Neutrality

OpenTelemetry is the CNCF standard. The exporter target (Jaeger, Datadog,
Honeycomb, Google Cloud Trace) is a single configuration line. Switching
observability vendors requires no application code changes.

## Consequences

**Positive:**
- Single `trace_id` connects logs and traces for any request
- Auto-instrumentation captures pg query timing with zero application code
- Vendor-neutral — no lock-in to a specific observability platform
- Graceful shutdown flushes pending spans before process exit

**Negative:**
- OTel SDK adds ~150ms to cold start time
- `SimpleSpanProcessor` (used in dev) exports synchronously and adds
  latency per span. Production must use `BatchSpanProcessor`.
- The initialisation order constraint is non-obvious and must be
  documented (this ADR) to prevent future regressions