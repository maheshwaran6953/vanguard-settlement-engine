// CRITICAL: db.helper must be the first import.
// It loads .env.test before the pool initialises.
import {
  cleanDatabase,
  closeDatabase,
} from '../helpers/db.helper';

import { api, registerAndLogin } from '../helpers/request.helper';
import { pool }                  from '../../core/database/pool';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';

// ----------------------------------------------------------------
// THE GRAND TOUR
// This test suite walks the complete financial lifecycle of a
// single invoice from registration through to virtual account
// creation. Every assertion reflects a real business guarantee
// this platform makes.
// ----------------------------------------------------------------
describe('Invoice Financing Lifecycle — Grand Tour', () => {

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // --------------------------------------------------------------
  // THE HAPPY PATH
  // Full lifecycle: Register → Submit → Approve →
  //   Request Financing → Risk Assessment → Create VAN
  // --------------------------------------------------------------
  it('completes the full invoice financing lifecycle', async () => {

    // ── Step 1: Register organisations ──────────────────────────
    const { supplierToken, buyerToken, supplierId, buyerId }
      = await registerAndLogin();

    expect(supplierId).toBeDefined();
    expect(buyerId).toBeDefined();

    // ── Step 2: Supplier submits invoice ────────────────────────
    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-GRAND-TOUR-001',
        buyer_id:       buyerId,
        amount_cents:   1_000_000,    // ₹10,000.00
        currency:       'INR',
        due_date:       '2026-12-31',
      })
      .expect(201);

    const invoice = submitRes.body.data;
    expect(invoice.status).toBe('SUBMITTED');
    expect(invoice.supplier_id).toBe(supplierId);  // from JWT, not body
    expect(invoice.buyer_id).toBe(buyerId);
    expect(+invoice.amount_cents).toBe(1_000_000);

    const invoiceId = invoice.id;

    // ── Step 3: Buyer approves with digital signature ───────────
    const approveRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        buyer_signature: 'sha256-integration-test-buyer-signature-abc',
      })
      .expect(200)
    expect(approveRes.body.data.status).toBe('BUYER_APPROVED');

    expect(approveRes.body.data.status).toBe('BUYER_APPROVED');
    expect(approveRes.body.data.buyer_signature).toBe(
      'sha256-integration-test-buyer-signature-abc'
    );

    // ── Step 4: Supplier requests financing ─────────────────────
    const financingRes = await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .expect(200);

    expect(financingRes.body.data.status).toBe('FINANCING_REQUESTED');

    // ── Step 5: Risk assessment — APPROVE path ──────────────────
    const riskRes = await api
      .post('/risk/assess')
      .send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            invoiceId,
          invoice_amount_cents:  1_000_000,
          po_amount_cents:       1_000_000,
          delivery_amount_cents: 1_000_000,
          po_number:             'PO-GT-001',
          delivery_receipt_id:   'DR-GT-001',
        },
        anomaly_signals: {
          invoice_id:               invoiceId,
          buyer_id:                 buyerId,
          supplier_id:              supplierId,
          amount_cents:             1_000_000,
          due_date:                 '2026-12-31',
          submitted_at:             new Date().toISOString(),
          avg_invoice_amount_cents: 900_000,
          days_until_due:           90,
          prior_default_count:      0,
        },
      })
      .expect(200);

    expect(riskRes.body.data.decision).toBe('APPROVE');
    expect(riskRes.body.data.three_way_match.passed).toBe(true);
    expect(riskRes.body.data.anomaly_result.flags).toHaveLength(0);

    // ── Step 6: Create Virtual Account Number ───────────────────
    const vanRes = await api
      .post('/vans')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_id:            invoiceId,
        expected_amount_cents: 1_000_000,
      })
      .expect(201);

    const van = vanRes.body.data;
    expect(van.status).toBe('active');
    expect(Number(van.expected_amount_cents)).toBe(1_000_000);
    expect(van.account_number).toMatch(/^VSE\d{12}$/);

    // ── Step 7: Verify audit trail in the database ───────────────
    // This is the assertion that proves event sourcing is working
    // under real API conditions — not just in isolation.
    const eventsResult = await pool.query(
      `SELECT event_type FROM invoice_events
       WHERE invoice_id = $1
       ORDER BY occurred_at ASC`,
      [invoiceId]
    );

    const eventTypes = eventsResult.rows.map(
      (r: { event_type: string }) => r.event_type
    );

    expect(eventTypes).toEqual([
      'invoice.submitted',
      'invoice.buyer_approved',
      'invoice.financing_requested',
      'risk.assessment.approve',
      'van.created',
    ]);

    // ── Step 8: Verify invoice status in the database ───────────
    // Proves the HTTP response and DB state are in sync.
    const invoiceResult = await pool.query(
      `SELECT status, buyer_signature FROM invoices WHERE id = $1`,
      [invoiceId]
    );

    expect(invoiceResult.rows[0].status).toBe('FINANCING_REQUESTED');
    expect(invoiceResult.rows[0].buyer_signature).toBe(
      'sha256-integration-test-buyer-signature-abc'
    );

    // ── Step 9: Verify ledger has the advance debit entry ───────
    const ledgerResult = await pool.query(
      `SELECT entry_type, amount_cents, idempotency_key
       FROM ledger_entries
       WHERE virtual_account_id = $1`,
      [van.id]
    );

    expect(ledgerResult.rows).toHaveLength(1);
    expect(ledgerResult.rows[0].entry_type).toBe('debit');
    expect(Number(ledgerResult.rows[0].amount_cents)).toBe(1_000_000);
    expect(ledgerResult.rows[0].idempotency_key).toBe(
      `advance-${invoiceId}`
    );
  });

  // --------------------------------------------------------------
  // SECURITY: RBAC enforcement
  // A supplier must not be able to approve their own invoice.
  // This is a financial fraud vector — we test it explicitly.
  // --------------------------------------------------------------
  it('prevents a supplier from approving their own invoice', async () => {
    const { supplierToken, buyerId } = await registerAndLogin(
      'supplier2@test.com',
      'buyer2@test.com'
    );

    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-RBAC-001',
        buyer_id:       buyerId,
        amount_cents:   500_000,
        currency:       'INR',
        due_date:       '2026-12-31',
        buyer_signature: 'sha256-integration-test-buyer-signature-abc',
      })
      .expect(201);

    const invoiceId = submitRes.body.data.id;

    // Supplier attempts to approve using their own token
    const approveRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ buyer_signature: 'sha256-self-approval-fraud-attempt' })
      .expect(403);

    expect(approveRes.body.success).toBe(false);
    expect(approveRes.body.error.code).toBe('FORBIDDEN');

    // Verify invoice status was NOT changed in the database
    const result = await pool.query(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    expect(result.rows[0].status).toBe('SUBMITTED');
  });

  // --------------------------------------------------------------
  // STATE MACHINE: Invalid transition rejection
  // An already-approved invoice cannot be approved again.
  // --------------------------------------------------------------
  it('rejects an invalid state machine transition', async () => {
    const { supplierToken, buyerToken, buyerId }
      = await registerAndLogin('supplier3@test.com', 'buyer3@test.com');

    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-SM-001',
        buyer_id:       buyerId,
        amount_cents:   250_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      })
      .expect(201);

    const invoiceId = submitRes.body.data.id;

    // First approval — should succeed
    await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-first-sig' })
      .expect(200);

    // Second approval — must be rejected
    const secondApproval = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-second-sig' })
      .expect(409);

    expect(secondApproval.body.error.code).toBe('INVALID_TRANSITION');
  });

  // --------------------------------------------------------------
  // RISK ENGINE: Three-way match failure rejects the invoice
  // --------------------------------------------------------------
  it('rejects an invoice that fails three-way match', async () => {
    const { supplierToken, buyerToken, buyerId, supplierId }
      = await registerAndLogin('supplier4@test.com', 'buyer4@test.com');

    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-RISK-001',
        buyer_id:       buyerId,
        amount_cents:   1_000_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      })
      .expect(201);

    const invoiceId = submitRes.body.data.id;

    await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-risk-test-sig' })
      .expect(200);

    await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .expect(200);

    // Submit with PO amount that is 50% of invoice — fails ±2% check
    const riskRes = await api
      .post('/risk/assess')
      .send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            invoiceId,
          invoice_amount_cents:  1_000_000,
          po_amount_cents:       500_000,   // 50% mismatch — instant reject
          delivery_amount_cents: 1_000_000,
          po_number:             'PO-FRAUD-001',
          delivery_receipt_id:   'DR-FRAUD-001',
        },
        anomaly_signals: {
          invoice_id:               invoiceId,
          buyer_id:                 buyerId,
          supplier_id:              supplierId,
          amount_cents:             1_000_000,
          due_date:                 '2026-12-31',
          submitted_at:             new Date().toISOString(),
          avg_invoice_amount_cents: 900_000,
          days_until_due:           90,
          prior_default_count:      0,
        },
      })
      .expect(422);

    expect(riskRes.body.data.decision).toBe('REJECT');
    expect(riskRes.body.data.reason_code).toBe('THREE_WAY_MATCH_FAILED');

    // Invoice must be CANCELLED in the database
    const result = await pool.query(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    expect(result.rows[0].status).toBe('CANCELLED');

    // Audit trail must contain the rejection event
    const events = await pool.query(
      `SELECT event_type FROM invoice_events
       WHERE invoice_id = $1 AND event_type = 'risk.assessment.reject'`,
      [invoiceId]
    );
    expect(events.rows).toHaveLength(1);
  });

  // --------------------------------------------------------------
  // IDEMPOTENCY: Duplicate webhook returns 200, no double-credit
  // --------------------------------------------------------------
  it('handles duplicate payment webhooks idempotently', async () => {
    const { supplierToken, buyerToken, buyerId, supplierId }
      = await registerAndLogin('supplier5@test.com', 'buyer5@test.com');

    // Build up to a VAN
    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-IDEM-001',
        buyer_id:       buyerId,
        amount_cents:   500_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      })
      .expect(201);

    const invoiceId = submitRes.body.data.id;

    await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-idem-sig' })
      .expect(200);

    await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .expect(200);

    await api
      .post('/risk/assess')
      .send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            invoiceId,
          invoice_amount_cents:  500_000,
          po_amount_cents:       500_000,
          delivery_amount_cents: 500_000,
          po_number:             'PO-IDEM-001',
          delivery_receipt_id:   'DR-IDEM-001',
        },
        anomaly_signals: {
          invoice_id:               invoiceId,
          buyer_id:                 buyerId,
          supplier_id:              supplierId,
          amount_cents:             500_000,
          due_date:                 '2026-12-31',
          submitted_at:             new Date().toISOString(),
          avg_invoice_amount_cents: 450_000,
          days_until_due:           90,
          prior_default_count:      0,
        },
      })
      .expect(200);

    const vanRes = await api
      .post('/vans')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ invoice_id: invoiceId, expected_amount_cents: 500_000 })
      .expect(201);

    const accountNumber = vanRes.body.data.account_number;
    const vanId         = vanRes.body.data.id;

    const webhookPayload = {
      account_number:  accountNumber,
      amount_cents:    500_000,
      idempotency_key: 'bank-txn-unique-ref-idem-001',
      paid_at:         '2026-07-01T10:00:00Z',
    };

    // First webhook — must succeed and settle the account
    const first = await api
      .post('/vans/webhook/payment')
      .send(webhookPayload)
      .expect(200);

    expect(first.body.data.is_fully_settled).toBe(true);

    // Second identical webhook — must return 200, no double-credit
    const second = await api
      .post('/vans/webhook/payment')
      .send(webhookPayload)
      .expect(200);

    expect(second.body.message).toBe('Payment already recorded');

    // The ledger must have exactly 2 entries:
    // 1 debit (advance) + 1 credit (payment) — never 3
    const ledger = await pool.query(
      `SELECT entry_type FROM ledger_entries
       WHERE virtual_account_id = $1
       ORDER BY created_at ASC`,
      [vanId]
    );

    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0].entry_type).toBe('debit');
    expect(ledger.rows[1].entry_type).toBe('credit');

    // Invoice must be REPAID — not REPAID twice
    const invoice = await pool.query(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    expect(invoice.rows[0].status).toBe('REPAID');
  });

  // --------------------------------------------------------------
  // VALIDATION: Malformed requests are rejected before touching
  // the service layer
  // --------------------------------------------------------------
  it('rejects unauthenticated requests with 401', async () => {
    const res = await api
      .post('/invoices')
      .send({ invoice_number: 'INV-UNAUTH-001' })
      .expect(401);

    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('rejects malformed invoice body with validation errors', async () => {
    const { supplierToken } = await registerAndLogin(
      'supplier6@test.com',
      'buyer6@test.com'
    );

    const res = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-VALID-001',
        // missing buyer_id, amount_cents, due_date
      })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });
});