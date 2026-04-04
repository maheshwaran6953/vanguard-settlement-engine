// The three-way match verifies that three documents agree.
// In production these arrive from the supplier's ERP system.
// For the MVP we accept them as structured input.
export interface ThreeWayMatchInput {
  invoice_id:          string;
  invoice_amount_cents: number;
  po_amount_cents:      number;       // Purchase Order amount
  delivery_amount_cents: number;      // Delivery Receipt amount
  po_number:            string;
  delivery_receipt_id:  string;
}

export interface ThreeWayMatchResult {
  passed:          boolean;
  variance_pct:    number;            // % difference between invoice and PO
  reason:          string;
}

// Anomaly signals — each is independently evaluated
export interface AnomalySignals {
  invoice_id:           string;
  buyer_id:             string;
  supplier_id:          string;
  amount_cents:         number;
  due_date:             Date;
  submitted_at:         Date;
  // Historical context — in production, queried from your data warehouse
  avg_invoice_amount_cents: number;  // supplier's 90-day average
  days_until_due:           number;
  prior_default_count:      number;  // buyer's historical defaults
}

export interface AnomalyResult {
  passed:   boolean;
  flags:    AnomalyFlag[];
  score:    number;            // 0 = clean, 100 = highly anomalous
}

export interface AnomalyFlag {
  code:     string;
  message:  string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Final risk decision
export type RiskDecision = 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW';

export interface RiskAssessmentResult {
  invoice_id:       string;
  decision:         RiskDecision;
  confidence_score: number;        // 0–100, higher = more confident in decision
  reason_code:      string;
  reason_message:   string;
  three_way_match:  ThreeWayMatchResult;
  anomaly_result:   AnomalyResult;
  buyer_risk_score: number;        // 0–100, higher = riskier buyer
  assessed_at:      Date;
}

// What the route handler receives
export interface AssessInvoiceRiskCommand {
  invoice_id:            string;
  three_way_match_input: ThreeWayMatchInput;
  anomaly_signals:       AnomalySignals;
}