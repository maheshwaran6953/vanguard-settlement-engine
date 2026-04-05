# ADR-0004: Three-Layer Risk Engine Architecture

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** Engineering Lead

---

## Context

Invoice fraud is the primary risk in receivables financing. Common fraud
vectors include:

- **Fabricated invoices** — no underlying goods or services were delivered
- **Inflated invoices** — real transaction, but amount is overstated
- **Round-tripping** — supplier and buyer are related parties
- **Stale buyer** — buyer has a history of default that the supplier did not disclose

A single credit score is insufficient to detect these vectors. A buyer
with a good credit score can still present a fabricated invoice.

## Decision

The risk engine is structured as **three independent verification layers**,
each targeting a different fraud vector:

### Layer 1: Three-Way Match (Hard Gate)

Compares the Invoice, Purchase Order, and Delivery Receipt. All three
documents must exist and agree within a ±2% variance threshold.

This is a **hard gate** — failure produces an instant `REJECT` regardless
of the buyer's credit score. We cannot fund an invoice we cannot verify
represents a real transaction.

The 2% variance threshold is the industry standard for invoice financing
in India, accommodating rounding differences and minor quantity adjustments.

### Layer 2: Anomaly Detection (Configurable Threshold)

Evaluates signals that are individually explainable but collectively
suspicious:

| Signal | Rationale |
|--------|-----------|
| Amount > 300% of supplier's 90-day average | Sudden large invoice is a fraud indicator |
| Due date < 7 days on large invoice | Artificially urgent terms pressure faster funding |
| Buyer has 3+ prior defaults | Structural default risk |

Anomaly scores are additive. A single medium signal does not reject.
Multiple signals together trigger `MANUAL_REVIEW` for a human underwriter.

### Layer 3: Buyer Risk Score (0–100)

A composite score from three components:
- Default history (weighted 40%)
- Recency of last payment (weighted 30%)
- Credit utilisation against platform limit (weighted 30%)

Scores above 75 trigger auto-reject. Scores between 50–75 trigger
`MANUAL_REVIEW`. Below 50, the buyer risk score does not block approval.

## Architecture: Pure Function

The risk engine is implemented as a **pure function**:
```typescript
function assessInvoiceRisk(cmd: AssessInvoiceRiskCommand): RiskAssessmentResult
```

- No database calls
- No side effects
- Deterministic: same input always produces same output

This means the engine is unit-testable without mocks, without a test
database, and without an HTTP server. The full decision logic can be
validated in milliseconds.

The `RiskService.assessAndRecord()` method wraps the pure engine and
handles persistence — keeping the scoring logic and the I/O layer
completely separate.

## Decision Output

Every assessment produces a structured result including:
- Final decision (`APPROVE` / `MANUAL_REVIEW` / `REJECT`)
- Confidence score (0–100)
- Machine-readable reason code
- Human-readable reason message
- Full sub-scores for each layer

This result is persisted as an immutable event in `invoice_events`,
providing a complete, auditable record of every funding decision.

## Consequences

**Positive:**
- Fraud vectors are addressed at multiple independent layers
- Pure function architecture enables fast, isolated unit testing
- Reason codes enable supplier-facing rejection explanations
- Full assessment payload in event log satisfies audit requirements

**Negative:**
- Three-way match requires suppliers to submit PO and delivery receipt
  data, adding friction to the onboarding flow
- Anomaly thresholds (300%, 7 days) are currently hardcoded and require
  a configuration service to tune without redeployment