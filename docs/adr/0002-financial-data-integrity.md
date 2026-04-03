# ADR 0002: Financial Data Integrity Standards

## Status
Accepted

## Context
Handling money requires 100% precision and a permanent audit trail. Standard programming defaults (like floating-point numbers or local timestamps) can lead to legal and financial discrepancies.

## Decisions

### 1. Use of `BIGINT` (Cents/Paise) for Amounts
We will store all monetary values as integers (e.g., 10050 instead of 100.50). 
- **Reason:** Floating-point math (`FLOAT`/`REAL`) is imprecise. Storing the smallest unit (Paise) prevents rounding errors during calculations.

### 2. Use of `TIMESTAMPTZ`
All time-based data will use `TIMESTAMP WITH TIME ZONE`.
- **Reason:** Financial settlements happen across regions. Without timezone context, "14:00" is ambiguous. `TIMESTAMPTZ` ensures every event is anchored to a global point in time.

### 3. Immutable Event Store (`REVOKE UPDATE/DELETE`)
The `invoice_events` table is "Append-Only."
- **Reason:** To ensure a perfect audit log, we have revoked `UPDATE` and `DELETE` permissions at the database level. If a mistake is made, a "Correction Event" must be added rather than modifying history.

## Consequences
- **Pros:** High auditability, zero rounding errors, and global synchronization.
- **Cons:** Application logic must handle the conversion from cents to decimals for display.