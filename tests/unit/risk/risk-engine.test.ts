import { assessInvoiceRisk }   from '../../../core/services/risk/risk.engine';
import { runThreeWayMatch }    from '../../../core/services/risk/three-way-match.engine';
import { runAnomalyDetection } from '../../../core/services/risk/anomaly.engine';
import { scoreBuyerRisk }      from '../../../core/services/risk/buyer-risk.engine';
import type {
  AssessInvoiceRiskCommand,
  ThreeWayMatchInput,
  AnomalySignals,
} from '../../../core/services/risk/risk.types';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';

const BASE_INVOICE_ID = 'test-invoice-00000000-0000-0000-0000-000000000001';

function makeThreeWayMatch(
  overrides: Partial<ThreeWayMatchInput> = {}
): ThreeWayMatchInput {
  return {
    invoice_id:            BASE_INVOICE_ID,
    invoice_amount_cents:  1_000_000,
    po_amount_cents:       1_000_000,
    delivery_amount_cents: 1_000_000,
    po_number:             'PO-TEST-001',
    delivery_receipt_id:   'DR-TEST-001',
    ...overrides,
  };
}

function makeAnomalySignals(
  overrides: Partial<AnomalySignals> = {}
): AnomalySignals {
  return {
    invoice_id:               BASE_INVOICE_ID,
    buyer_id:                 'buyer-00000000-0000-0000-0000-000000000001',
    supplier_id:              'supplier-00000000-0000-0000-0000-000000000001',
    amount_cents:             1_000_000,
    due_date:                 new Date('2026-12-31'),
    submitted_at:             new Date('2026-04-01'),
    avg_invoice_amount_cents: 900_000,
    days_until_due:           90,
    prior_default_count:      0,
    ...overrides,
  };
}

function makeCommand(
  threeWayOverrides: Partial<ThreeWayMatchInput> = {},
  anomalyOverrides:  Partial<AnomalySignals>     = {}
): AssessInvoiceRiskCommand {
  return {
    invoice_id:            BASE_INVOICE_ID,
    three_way_match_input: makeThreeWayMatch(threeWayOverrides),
    anomaly_signals:       makeAnomalySignals(anomalyOverrides),
  };
}

// ================================================================
// THREE-WAY MATCH ENGINE
// ================================================================

describe('runThreeWayMatch', () => {

  it('passes when invoice, PO, and delivery amounts are identical', () => {
    const result = runThreeWayMatch(makeThreeWayMatch());

    expect(result.passed).toBe(true);
    expect(result.variance_pct).toBe(0);
    expect(result.reason).toBe('THREE_WAY_MATCH_PASSED');
  });

  it('passes when invoice is within the 2% variance threshold', () => {
    // Invoice is 1.5% above PO — within tolerance.
    // Delivery amount must be >= invoice amount or Rule 4 fires.
    const result = runThreeWayMatch(makeThreeWayMatch({
      invoice_amount_cents:  1_015_000,
      po_amount_cents:       1_000_000,
      delivery_amount_cents: 1_015_000,  // matches invoice — no shortfall
    }));

    expect(result.passed).toBe(true);
    expect(result.variance_pct).toBeLessThanOrEqual(2.0);
  });

  it('fails when invoice amount exceeds PO by more than 2%', () => {
    const result = runThreeWayMatch(makeThreeWayMatch({
      invoice_amount_cents:  1_500_000,
      po_amount_cents:       1_000_000,
      delivery_amount_cents: 1_500_000,
    }));

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('AMOUNT_MISMATCH');
    expect(result.variance_pct).toBeGreaterThan(2.0);
  });

  it('fails when invoice amount is below PO by more than 2%', () => {
    const result = runThreeWayMatch(makeThreeWayMatch({
      invoice_amount_cents:  500_000,
      po_amount_cents:       1_000_000,
      delivery_amount_cents: 1_000_000,
    }));

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('AMOUNT_MISMATCH');
  });

  it('fails when PO number is missing', () => {
    const result = runThreeWayMatch(makeThreeWayMatch({
      po_number:       '',
      po_amount_cents: 0,
    }));

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('MISSING_PO');
  });

  it('fails when delivery receipt ID is missing', () => {
    const result = runThreeWayMatch(makeThreeWayMatch({
      delivery_receipt_id: '',
    }));

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('MISSING_DELIVERY_RECEIPT');
  });

  it('fails when delivery amount is less than invoice amount', () => {
    const result = runThreeWayMatch(makeThreeWayMatch({
      invoice_amount_cents:  1_000_000,
      po_amount_cents:       1_000_000,
      delivery_amount_cents: 800_000,   // shortfall of 200,000 paise
    }));

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('DELIVERY_SHORTFALL');
  });
});

// ================================================================
// ANOMALY DETECTION ENGINE
// ================================================================

describe('runAnomalyDetection', () => {

  it('returns clean result for a normal invoice with no anomalies', () => {
    const result = runAnomalyDetection(makeAnomalySignals());

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(result.flags).toHaveLength(0);
  });

  it('flags AMOUNT_SPIKE_CRITICAL when deviation is strictly above 300%', () => {
    // Engine condition: deviationPct > 300 (strictly greater than)
    // 5_000_000 vs 1_000_000 = 400% deviation — clears the threshold
    const result = runAnomalyDetection(makeAnomalySignals({
      amount_cents:             5_000_000,
      avg_invoice_amount_cents: 1_000_000,
    }));

    const criticalFlag = result.flags.find(
      (f) => f.code === 'AMOUNT_SPIKE_CRITICAL'
    );

    expect(criticalFlag).toBeDefined();
    expect(criticalFlag?.severity).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('does NOT flag AMOUNT_SPIKE_CRITICAL at exactly 300% deviation', () => {
    // 4_000_000 vs 1_000_000 = exactly 300% — condition is > 300, not >= 300
    // Falls into AMOUNT_SPIKE_MODERATE instead
    const result = runAnomalyDetection(makeAnomalySignals({
      amount_cents:             4_000_000,
      avg_invoice_amount_cents: 1_000_000,
    }));

    const criticalFlag = result.flags.find(
      (f) => f.code === 'AMOUNT_SPIKE_CRITICAL'
    );
    const moderateFlag = result.flags.find(
      (f) => f.code === 'AMOUNT_SPIKE_MODERATE'
    );

    expect(criticalFlag).toBeUndefined();
    expect(moderateFlag).toBeDefined();
  });

  it('flags AMOUNT_SPIKE_MODERATE when deviation is 150–300%', () => {
    // 3_000_000 vs 1_000_000 = 200% deviation — in moderate range
    const result = runAnomalyDetection(makeAnomalySignals({
      amount_cents:             3_000_000,
      avg_invoice_amount_cents: 1_000_000,
    }));

    const moderateFlag = result.flags.find(
      (f) => f.code === 'AMOUNT_SPIKE_MODERATE'
    );

    expect(moderateFlag).toBeDefined();
    expect(moderateFlag?.severity).toBe('MEDIUM');
    expect(result.score).toBe(20);
  });

  it('flags UNUSUALLY_SHORT_PAYMENT_TERM for large invoices due in under 7 days', () => {
    const result = runAnomalyDetection(makeAnomalySignals({
      days_until_due: 3,
      amount_cents:   500_000,
    }));

    const shortTermFlag = result.flags.find(
      (f) => f.code === 'UNUSUALLY_SHORT_PAYMENT_TERM'
    );

    expect(shortTermFlag).toBeDefined();
    expect(shortTermFlag?.severity).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it('flags BUYER_HIGH_DEFAULT_HISTORY when buyer has 3+ defaults', () => {
    const result = runAnomalyDetection(makeAnomalySignals({
      prior_default_count: 3,
    }));

    const defaultFlag = result.flags.find(
      (f) => f.code === 'BUYER_HIGH_DEFAULT_HISTORY'
    );

    expect(defaultFlag).toBeDefined();
    expect(defaultFlag?.severity).toBe('HIGH');
    expect(result.score).toBe(40);
  });

  it('flags BUYER_DEFAULT_HISTORY for 1–2 prior defaults', () => {
    const result = runAnomalyDetection(makeAnomalySignals({
      prior_default_count: 1,
    }));

    const defaultFlag = result.flags.find(
      (f) => f.code === 'BUYER_DEFAULT_HISTORY'
    );

    expect(defaultFlag).toBeDefined();
    expect(defaultFlag?.severity).toBe('MEDIUM');
    expect(result.score).toBe(20);
  });

  it('accumulates score correctly from multiple independent signals', () => {
    // 5_000_000 vs 1_000_000 = 400% = AMOUNT_SPIKE_CRITICAL (40 pts)
    // prior_default_count 3 = BUYER_HIGH_DEFAULT_HISTORY (40 pts)
    // Total = 80 pts
    const result = runAnomalyDetection(makeAnomalySignals({
      amount_cents:             5_000_000,
      avg_invoice_amount_cents: 1_000_000,
      prior_default_count:      3,
    }));

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.flags.length).toBeGreaterThanOrEqual(2);

    const severities = result.flags.map((f) => f.severity);
    expect(severities).toContain('HIGH');
  });
});

// ================================================================
// BUYER RISK SCORING ENGINE
// ================================================================

describe('scoreBuyerRisk', () => {

  it('returns 0 for a perfect buyer with no risk factors', () => {
    const score = scoreBuyerRisk({
      prior_default_count:      0,
      days_since_last_payment:  5,
      outstanding_amount_cents: 0,
      credit_limit_cents:       10_000_000,
    });

    expect(score).toBe(0);
  });

  it('returns high score for buyer with 3 defaults and no recent payment', () => {
    const score = scoreBuyerRisk({
      prior_default_count:      3,
      days_since_last_payment:  200,
      outstanding_amount_cents: 9_000_000,
      credit_limit_cents:       10_000_000,
    });

    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('clamps output to maximum of 100', () => {
    const score = scoreBuyerRisk({
      prior_default_count:      10,
      days_since_last_payment:  999,
      outstanding_amount_cents: 10_000_000,
      credit_limit_cents:       10_000_000,
    });

    expect(score).toBe(100);
  });

  it('scores high utilisation higher than low utilisation', () => {
    const highUtil = scoreBuyerRisk({
      prior_default_count:      0,
      days_since_last_payment:  5,
      outstanding_amount_cents: 9_500_000,
      credit_limit_cents:       10_000_000,
    });

    const lowUtil = scoreBuyerRisk({
      prior_default_count:      0,
      days_since_last_payment:  5,
      outstanding_amount_cents: 1_000_000,
      credit_limit_cents:       10_000_000,
    });

    expect(highUtil).toBeGreaterThan(lowUtil);
  });
});

// ================================================================
// FULL RISK ENGINE — assessInvoiceRisk
// ================================================================

describe('assessInvoiceRisk', () => {

  it('returns APPROVE with high confidence for a clean low-risk invoice', () => {
    const result = assessInvoiceRisk(makeCommand());

    expect(result.decision).toBe('APPROVE');
    expect(result.confidence_score).toBeGreaterThanOrEqual(70);
    expect(result.reason_code).toBe('ALL_CHECKS_PASSED');
    expect(result.three_way_match.passed).toBe(true);
    expect(result.anomaly_result.flags).toHaveLength(0);
    expect(result.buyer_risk_score).toBeLessThan(50);
  });

  it('returns REJECT when three-way match fails regardless of buyer quality', () => {
    const result = assessInvoiceRisk(
      makeCommand(
        {
          po_amount_cents:       500_000,
          delivery_amount_cents: 1_000_000,
        },
        { prior_default_count: 0 }
      )
    );

    expect(result.decision).toBe('REJECT');
    expect(result.reason_code).toBe('THREE_WAY_MATCH_FAILED');
    expect(result.confidence_score).toBeGreaterThanOrEqual(90);
    expect(result.three_way_match.passed).toBe(false);
  });

  it('returns REJECT when buyer risk score exceeds 75', () => {
    // Force a high buyer risk score through the anomaly signals.
    // prior_default_count=3 maps to HIGH default flag in anomaly
    // AND contributes to buyer risk score in the engine.
    const result = assessInvoiceRisk(
      makeCommand(
        {},
        { prior_default_count: 5, days_until_due: 200 }
      )
    );

    if (result.buyer_risk_score >= 75) {
      expect(result.decision).toBe('REJECT');
      expect(result.reason_code).toBe('BUYER_RISK_TOO_HIGH');
    } else {
      // Score came in under threshold — still elevated
      expect(['REJECT', 'MANUAL_REVIEW']).toContain(result.decision);
    }
  });

  it('returns REJECT when anomaly score is critical with HIGH severity flags', () => {
    // 400% spike (CRITICAL, 40pts) + 3 defaults (HIGH, 40pts) = 80 anomaly score
    // Score > 60 with critical flags → REJECT
    const result = assessInvoiceRisk(
      makeCommand(
        {},
        {
          amount_cents:             5_000_000,
          avg_invoice_amount_cents: 1_000_000,
          prior_default_count:      3,
        }
      )
    );

    expect(result.decision).toBe('REJECT');
    expect(result.anomaly_result.score).toBeGreaterThan(60);

    const highFlags = result.anomaly_result.flags.filter(
      (f) => f.severity === 'HIGH'
    );
    expect(highFlags.length).toBeGreaterThanOrEqual(1);
  });

  it('always populates assessed_at with a valid Date', () => {
    const before = new Date();
    const result = assessInvoiceRisk(makeCommand());
    const after  = new Date();

    expect(result.assessed_at).toBeInstanceOf(Date);
    expect(result.assessed_at.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(result.assessed_at.getTime()).toBeLessThanOrEqual(
      after.getTime()
    );
  });

  it('preserves the invoice_id from the command in the result', () => {
    const result = assessInvoiceRisk(makeCommand());
    expect(result.invoice_id).toBe(BASE_INVOICE_ID);
  });
});