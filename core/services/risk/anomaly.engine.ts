import { AnomalySignals, AnomalyResult, AnomalyFlag } from './risk.types';

export function runAnomalyDetection(
  signals: AnomalySignals
): AnomalyResult {

  const flags: AnomalyFlag[] = [];
  let score = 0;

  // --- Signal 1: Invoice amount deviates heavily from supplier's average ---
  // A supplier who normally invoices ₹50,000 suddenly submitting a
  // ₹5,000,000 invoice is a strong fraud signal.
  if (signals.avg_invoice_amount_cents > 0) {
    const deviationPct = Math.abs(
      (signals.amount_cents - signals.avg_invoice_amount_cents) /
      signals.avg_invoice_amount_cents
    ) * 100;

    if (deviationPct > 300) {
      flags.push({
        code:     'AMOUNT_SPIKE_CRITICAL',
        message:  `Invoice amount is ${deviationPct.toFixed(0)}% above supplier's 90-day average`,
        severity: 'HIGH',
      });
      score += 40;
    } else if (deviationPct > 150) {
      flags.push({
        code:     'AMOUNT_SPIKE_MODERATE',
        message:  `Invoice amount is ${deviationPct.toFixed(0)}% above supplier's 90-day average`,
        severity: 'MEDIUM',
      });
      score += 20;
    }
  }

  // --- Signal 2: Due date is suspiciously short ---
  // Legitimate 90-day payment terms are standard.
  // A 3-day due date on a large invoice is anomalous.
  if (signals.days_until_due < 7 && signals.amount_cents > 100_000) {
    flags.push({
      code:     'UNUSUALLY_SHORT_PAYMENT_TERM',
      message:  `Invoice due in ${signals.days_until_due} days — unusually short for this amount`,
      severity: 'HIGH',
    });
    score += 35;
  } else if (signals.days_until_due < 14) {
    flags.push({
      code:     'SHORT_PAYMENT_TERM',
      message:  `Invoice due in ${signals.days_until_due} days`,
      severity: 'LOW',
    });
    score += 10;
  }

  // --- Signal 3: Buyer has a history of defaults ---
  if (signals.prior_default_count >= 3) {
    flags.push({
      code:     'BUYER_HIGH_DEFAULT_HISTORY',
      message:  `Buyer has ${signals.prior_default_count} prior defaults on record`,
      severity: 'HIGH',
    });
    score += 40;
  } else if (signals.prior_default_count >= 1) {
    flags.push({
      code:     'BUYER_DEFAULT_HISTORY',
      message:  `Buyer has ${signals.prior_default_count} prior default(s) on record`,
      severity: 'MEDIUM',
    });
    score += 20;
  }

  // --- Signal 4: Same buyer-supplier pair submitted multiple invoices
  // in rapid succession — possible invoice duplication fraud.
  // (In production, query invoice_events for frequency.)

  // Score interpretation:
  // 0–20:  Clean
  // 21–50: Review recommended
  // 51+:   High risk
  const passed = score <= 50;

  return { passed, flags, score };
}