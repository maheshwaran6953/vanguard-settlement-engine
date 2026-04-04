// Buyer risk score: 0 = safest, 100 = highest risk
// In production this queries your data warehouse, external credit
// bureau APIs (e.g. CIBIL Commercial, Experian Business), and
// payment history from your own ledger.
//
// For the MVP we simulate this with a deterministic algorithm
// based on available signals so the engine produces meaningful
// output without external API dependencies.

export interface BuyerRiskInput {
  prior_default_count:    number;
  days_since_last_payment: number;   // 0 = paid recently, 999 = never paid
  outstanding_amount_cents: number;  // total currently owed to platform
  credit_limit_cents:       number;  // buyer's approved platform credit limit
}

export function scoreBuyerRisk(input: BuyerRiskInput): number {
  let score = 0;

  // Component 1: Default history (max 40 points)
  score += Math.min(input.prior_default_count * 15, 40);

  // Component 2: Recency of last payment (max 30 points)
  if (input.days_since_last_payment > 180) {
    score += 30;
  } else if (input.days_since_last_payment > 90) {
    score += 20;
  } else if (input.days_since_last_payment > 30) {
    score += 10;
  }

  // Component 3: Credit utilisation (max 30 points)
  // High utilisation relative to credit limit = higher risk
  if (input.credit_limit_cents > 0) {
    const utilisation =
      input.outstanding_amount_cents / input.credit_limit_cents;

    if (utilisation > 0.9) {
      score += 30;
    } else if (utilisation > 0.7) {
      score += 20;
    } else if (utilisation > 0.5) {
      score += 10;
    }
  }

  // Clamp to 0–100
  return Math.min(Math.max(Math.round(score), 0), 100);
}