import { runThreeWayMatch }    from './three-way-match.engine';
import { runAnomalyDetection } from './anomaly.engine';
import { scoreBuyerRisk }      from './buyer-risk.engine';
import {
  AssessInvoiceRiskCommand,
  RiskAssessmentResult,
  RiskDecision,
} from './risk.types';

// Thresholds for the final decision
const BUYER_RISK_AUTO_REJECT_THRESHOLD  = 75;  // score above this → auto-reject
const BUYER_RISK_MANUAL_REVIEW_THRESHOLD = 50; // score above this → manual review
const ANOMALY_MANUAL_REVIEW_THRESHOLD   = 30;  // anomaly score above this → review

export function assessInvoiceRisk(
  cmd: AssessInvoiceRiskCommand
): RiskAssessmentResult {

  // --- Run all three engines independently ---
  const threeWayMatch = runThreeWayMatch(cmd.three_way_match_input);

  const anomalyResult = runAnomalyDetection(cmd.anomaly_signals);

  // Derive buyer risk input from anomaly signals
  const buyerRiskScore = scoreBuyerRisk({
    prior_default_count:     cmd.anomaly_signals.prior_default_count,
    days_since_last_payment: cmd.anomaly_signals.days_until_due,
    outstanding_amount_cents: 0,      // query from ledger in production
    credit_limit_cents:       10_000_000_00, // ₹1Cr default limit
  });

  // --- Decision logic: most conservative signal wins ---

  // Gate 1: Three-way match is a hard gate. Failure = instant reject.
  // We cannot fund an invoice we cannot verify exists.
  if (!threeWayMatch.passed) {
    return buildResult(cmd.invoice_id, 'REJECT', 95, {
      reason_code:    'THREE_WAY_MATCH_FAILED',
      reason_message: threeWayMatch.reason,
      threeWayMatch,
      anomalyResult,
      buyerRiskScore,
    });
  }

  // Gate 2: Buyer auto-reject threshold
  if (buyerRiskScore >= BUYER_RISK_AUTO_REJECT_THRESHOLD) {
    return buildResult(cmd.invoice_id, 'REJECT', 85, {
      reason_code:    'BUYER_RISK_TOO_HIGH',
      reason_message: `Buyer risk score ${buyerRiskScore}/100 exceeds auto-reject threshold`,
      threeWayMatch,
      anomalyResult,
      buyerRiskScore,
    });
  }

  // Gate 3: Critical anomaly flags = auto-reject
  const hasCriticalAnomaly = anomalyResult.flags.some(
    f => f.severity === 'HIGH'
  );
  if (hasCriticalAnomaly && anomalyResult.score > 60) {
    return buildResult(cmd.invoice_id, 'REJECT', 80, {
      reason_code:    'CRITICAL_ANOMALY_DETECTED',
      reason_message: `Anomaly score ${anomalyResult.score}/100 with critical flags`,
      threeWayMatch,
      anomalyResult,
      buyerRiskScore,
    });
  }

  // Gate 4: Elevated signals → manual review
  if (
    buyerRiskScore >= BUYER_RISK_MANUAL_REVIEW_THRESHOLD ||
    anomalyResult.score >= ANOMALY_MANUAL_REVIEW_THRESHOLD
  ) {
    return buildResult(cmd.invoice_id, 'MANUAL_REVIEW', 60, {
      reason_code:    'ELEVATED_RISK_SIGNALS',
      reason_message: `Buyer risk: ${buyerRiskScore}/100, Anomaly score: ${anomalyResult.score}/100`,
      threeWayMatch,
      anomalyResult,
      buyerRiskScore,
    });
  }

  // All gates cleared → approve
  const confidenceScore = Math.max(
    0,
    100 - buyerRiskScore - anomalyResult.score
  );

  return buildResult(cmd.invoice_id, 'APPROVE', confidenceScore, {
    reason_code:    'ALL_CHECKS_PASSED',
    reason_message: 'Three-way match verified, anomaly score within threshold, buyer risk acceptable',
    threeWayMatch,
    anomalyResult,
    buyerRiskScore,
  });
}

// ------------------------------------------------------------------
// Private builder — keeps the decision branches readable
// ------------------------------------------------------------------
function buildResult(
  invoiceId: string,
  decision:  RiskDecision,
  confidence: number,
  details: {
    reason_code:    string;
    reason_message: string;
    threeWayMatch:  ReturnType<typeof runThreeWayMatch>;
    anomalyResult:  ReturnType<typeof runAnomalyDetection>;
    buyerRiskScore: number;
  }
): RiskAssessmentResult {
  return {
    invoice_id:       invoiceId,
    decision,
    confidence_score: Math.round(confidence),
    reason_code:      details.reason_code,
    reason_message:   details.reason_message,
    three_way_match:  details.threeWayMatch,
    anomaly_result:   details.anomalyResult,
    buyer_risk_score: details.buyerRiskScore,
    assessed_at:      new Date(),
  };
}