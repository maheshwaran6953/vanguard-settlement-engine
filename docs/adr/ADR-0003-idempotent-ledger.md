# ADR-0003: Defence-in-Depth Idempotency for Payment Webhooks

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** Engineering Lead

---

## Context

When a buyer's payment arrives into a Virtual Account Number (VAN), the
platform's banking partner sends a webhook notification. Webhook delivery
is **not exactly-once**. The same payment event may be delivered:

- Twice (retry on timeout)
- After the account has already been settled by a previous delivery
- Concurrently (two deliveries in the same millisecond window)

A naive implementation that credits the ledger on every webhook receipt
will double-credit the supplier and produce an unreconcilable ledger.

## Decision

We implement **two independent idempotency guards** in sequence:

### Layer 1 — Application-Level Check (Pre-Transaction)

Before opening a database transaction, the service fetches all existing
ledger entries for the VAN and checks whether the incoming
`idempotency_key` (the bank's unique transaction reference) already exists.

If it does, a `DuplicatePaymentError` is thrown immediately. The router
catches this specific error and returns `HTTP 200` to the bank — signalling
that the payment was successfully processed (it was, on the first delivery).
This prevents the bank from retrying indefinitely.

**Why check before the transaction?** Opening a transaction acquires
locks. Under high webhook volume, pre-transaction checks reduce contention
and are cheaper to execute.

### Layer 2 — Database Constraint (Inside Transaction)
```sql
idempotency_key TEXT NOT NULL UNIQUE
```

The `UNIQUE` constraint on `ledger_entries.idempotency_key` is the physical
last line of defence. If two concurrent webhook requests both pass Layer 1
at the same instant (a race condition), only one `INSERT` will succeed.
The other receives PostgreSQL error code `23505` (unique violation), which
the service catches and re-throws as `DuplicatePaymentError`.

### Why the order matters

The idempotency check (Layer 1) must execute **before** the settled-account
check. If a webhook arrives after the account has been settled by a previous
(legitimate) delivery, it is a duplicate — not a new payment into a
closed account. Checking settled status first would incorrectly return
an error to the bank and trigger infinite retries.

## Consequences

**Positive:**
- Webhook retries are handled gracefully with no operator intervention
- No double-credits possible regardless of delivery order or concurrency
- Bank always receives a success response, eliminating retry storms

**Negative:**
- One additional SELECT query per webhook (Layer 1 check)
- Slightly more complex control flow than a single DB constraint

## Money Representation

All amounts are stored as `BIGINT` in the smallest currency unit (paise).
`FLOAT` and `DECIMAL` types are explicitly prohibited in the schema for
financial amounts. Floating-point arithmetic is non-deterministic:
`0.1 + 0.2 = 0.30000000000000004` in IEEE 754. In a ledger, that is a
compliance defect.
```sql
amount_cents BIGINT NOT NULL CHECK (amount_cents > 0)