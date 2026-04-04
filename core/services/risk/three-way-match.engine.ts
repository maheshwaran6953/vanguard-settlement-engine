import { ThreeWayMatchInput, ThreeWayMatchResult } from './risk.types';

// Acceptable variance between invoice and PO amounts.
// Industry standard for invoice financing is ±2%.
const MAX_VARIANCE_PCT = 2.0;

export function runThreeWayMatch(
  input: ThreeWayMatchInput
): ThreeWayMatchResult {

  // Rule 1: PO must exist and have a positive amount
  if (!input.po_number || input.po_amount_cents <= 0) {
    return {
      passed:       false,
      variance_pct: 0,
      reason:       'MISSING_PO: No valid Purchase Order reference provided',
    };
  }

  // Rule 2: Delivery receipt must exist
  if (!input.delivery_receipt_id) {
    return {
      passed:       false,
      variance_pct: 0,
      reason:       'MISSING_DELIVERY_RECEIPT: No delivery confirmation provided',
    };
  }

  // Rule 3: Invoice amount must be within variance of PO amount.
  // We compare invoice to PO — the PO is the contractual agreement.
  const variance = Math.abs(
    input.invoice_amount_cents - input.po_amount_cents
  );
  const variancePct = (variance / input.po_amount_cents) * 100;

  if (variancePct > MAX_VARIANCE_PCT) {
    return {
      passed:       false,
      variance_pct: variancePct,
      reason:       `AMOUNT_MISMATCH: Invoice amount varies ${variancePct.toFixed(2)}% ` +
                    `from PO amount (max allowed: ${MAX_VARIANCE_PCT}%)`,
    };
  }

  // Rule 4: Delivery amount must confirm the full invoice value
  if (input.delivery_amount_cents < input.invoice_amount_cents) {
    const shortfall = input.invoice_amount_cents - input.delivery_amount_cents;
    return {
      passed:       false,
      variance_pct: variancePct,
      reason:       `DELIVERY_SHORTFALL: Delivery receipt confirms ` +
                    `${shortfall} paise less than the invoice amount`,
    };
  }

  return {
    passed:       true,
    variance_pct: variancePct,
    reason:       'THREE_WAY_MATCH_PASSED',
  };
}