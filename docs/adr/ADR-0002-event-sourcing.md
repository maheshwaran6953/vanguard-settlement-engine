# ADR-0002: Event Sourcing for Invoice Audit Trail

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** Engineering Lead

---

## Context

Invoice financing platforms operate in a regulated environment. Lenders,
auditors, and the RBI may require a complete reconstruction of why any
funding decision was made — including the exact sequence of state changes,
who triggered each one, and what data was present at the time.

A traditional approach (updating a status column) destroys this history.
Once an invoice moves from `SUBMITTED` to `BUYER_APPROVED`, there is no
record of when the transition happened or what payload the buyer sent.

## Decision

We maintain an `invoice_events` table as an **append-only event store**.
Every state transition writes an event row containing:

- `event_type` — the name of what happened (e.g. `invoice.buyer_approved`)
- `payload` (JSONB) — a full snapshot of the data at the moment of the event
- `actor_id` — the authenticated organisation that triggered the action
- `occurred_at` — the precise timestamp

The `invoices.status` column is a **read projection** of the event log —
a convenience cache of the latest state. The event log is the source of truth.

Both writes (status update + event append) occur inside a single
`BEGIN / COMMIT` transaction. They are never out of sync.

## Enforcement
```sql
REVOKE UPDATE, DELETE ON invoice_events FROM PUBLIC;
```

The database physically prevents mutation. This is not a coding convention —
it is enforced at the storage engine level. A developer cannot accidentally
or maliciously alter history even with direct database access.

## Consequences

**Positive:**
- Complete audit trail recoverable for any invoice at any point in time
- Actor identity on every transition satisfies KYC/AML logging requirements
- Event payload provides point-in-time snapshots for dispute resolution

**Negative:**
- Every state transition requires two writes instead of one
- Querying "current state" requires either the projection column or
  replaying events (we use the projection column for performance)

## Alternatives Considered

**Soft deletes / updated_at columns** — rejected. These tell you the
current state but not the history of how it was reached.

**Change Data Capture (Debezium)** — considered for a future phase.
CDC provides the same guarantees at the infrastructure level and would
allow event streaming to downstream consumers without application changes.