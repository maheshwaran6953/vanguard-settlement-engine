// tests/integration/invoice-lifecycle.test.ts
//
// CRITICAL IMPORT ORDER — do not change.
// db.helper must be first because it calls dotenv.config({ override: true })
// before the pool module is evaluated. If pool loads first it reads the
// development DB credentials and all tests hit the wrong database.

import path   from 'path';
import dotenv from 'dotenv';

dotenv.config({
  path:     path.resolve(__dirname, '../../infra/config/.env.test'),
  override: true,
});

// Only import application modules AFTER env is loaded
import supertest          from 'supertest';
import { buildApp }       from '../../services/app';
import { pool }           from '../../core/database/pool';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';

// ----------------------------------------------------------------
// Test infrastructure
// ----------------------------------------------------------------

const app = buildApp();
const api = supertest(app);

async function cleanDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      invoice_events,
      ledger_entries,
      virtual_accounts,
      invoices,
      organisation_credentials,
      organisations
    RESTART IDENTITY CASCADE;
  `);
}

interface AuthTokens {
  supplierToken: string;
  buyerToken:    string;
  supplierId:    string;
  buyerId:       string;
}

async function registerAndLogin(
  supplierEmail = 'supplier@test.com',
  buyerEmail    = 'buyer@test.com'
): Promise<AuthTokens> {
  const supplierRes = await api
    .post('/auth/register')
    .send({
      legal_name: 'Alpha Tech Pvt Ltd',
      role:       'supplier',
      email:      supplierEmail,
      password:   'TestPassword123!',
    });

  if (supplierRes.status !== 201) {
    throw new Error(
      `Supplier registration failed: ${JSON.stringify(supplierRes.body)}`
    );
  }

  const buyerRes = await api
    .post('/auth/register')
    .send({
      legal_name: 'Zoho Corporation',
      role:       'buyer',
      email:      buyerEmail,
      password:   'TestPassword456!',
    });

  if (buyerRes.status !== 201) {
    throw new Error(
      `Buyer registration failed: ${JSON.stringify(buyerRes.body)}`
    );
  }

  return {
    supplierToken: supplierRes.body.data.token        as string,
    buyerToken:    buyerRes.body.data.token           as string,
    supplierId:    supplierRes.body.data.organisation.id as string,
    buyerId:       buyerRes.body.data.organisation.id as string,
  };
}

// ----------------------------------------------------------------
// Suite setup and teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await pool.end();
});

// ----------------------------------------------------------------
// THE GRAND TOUR
// ----------------------------------------------------------------

describe('Invoice Financing Lifecycle — Grand Tour', () => {

  // --------------------------------------------------------------
  // HAPPY PATH: Full lifecycle
  // Register → Submit → Approve → Request Financing →
  // Risk Assessment → Create VAN → Verify audit trail
  // --------------------------------------------------------------
  it('completes the full invoice financing lifecycle', async () => {

    // Step 1: Register organisations
    const { supplierToken, buyerToken, supplierId, buyerId }
      = await registerAndLogin();

    expect(supplierId).toBeDefined();
    expect(buyerId).toBeDefined();

    // Step 2: Supplier submits invoice
    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-GRAND-TOUR-001',
        buyer_id:       buyerId,
        amount_cents:   1_000_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      });

    expect(submitRes.status).toBe(201);

    const invoice = submitRes.body.data as {
      id:           string;
      status:       string;
      supplier_id:  string;
      buyer_id:     string;
      amount_cents: number;
    };

    expect(invoice.status).toBe('SUBMITTED');
    expect(invoice.supplier_id).toBe(supplierId);
    expect(invoice.buyer_id).toBe(buyerId);
    expect(Number(invoice.amount_cents)).toBe(1_000_000);

    const invoiceId = invoice.id;

    // Step 3: Buyer approves with digital signature
    const approveRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        buyer_signature: 'sha256-integration-test-buyer-signature-abc',
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('BUYER_APPROVED');
    expect(approveRes.body.data.buyer_signature).toBe(
      'sha256-integration-test-buyer-signature-abc'
    );

    // Step 4: Supplier requests financing
    const financingRes = await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplierToken}`);

    expect(financingRes.status).toBe(200);
    expect(financingRes.body.data.status).toBe('FINANCING_REQUESTED');

    // Step 5: Risk assessment — APPROVE path
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
      });

    expect(riskRes.status).toBe(200);
    expect(riskRes.body.data.decision).toBe('APPROVE');
    expect(riskRes.body.data.three_way_match.passed).toBe(true);
    expect(riskRes.body.data.anomaly_result.flags).toHaveLength(0);

    // Step 6: Create Virtual Account Number
    const vanRes = await api
      .post('/vans')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_id:            invoiceId,
        expected_amount_cents: 1_000_000,
      });

    expect(vanRes.status).toBe(201);

    const van = vanRes.body.data as {
      id:                    string;
      status:                string;
      account_number:        string;
      expected_amount_cents: number;
    };

    expect(van.status).toBe('active');
    expect(Number(van.expected_amount_cents)).toBe(1_000_000);
    expect(van.account_number).toMatch(/^VSE\d{12}$/);

    // Step 7: Verify audit trail directly in the database.
    // This is the assertion that proves event sourcing works
    // under real HTTP conditions — not just in unit isolation.
    const eventsResult = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM invoice_events
       WHERE invoice_id = $1
       ORDER BY occurred_at ASC`,
      [invoiceId]
    );

    const eventTypes = eventsResult.rows.map((r) => r.event_type);

    expect(eventTypes).toEqual([
      'invoice.submitted',
      'invoice.buyer_approved',
      'invoice.financing_requested',
      'risk.assessment.approve',
      'van.created',
    ]);

    // Step 8: Verify invoice state in DB matches HTTP response
    const invoiceRow = await pool.query<{
      status:          string;
      buyer_signature: string;
    }>(
      `SELECT status, buyer_signature FROM invoices WHERE id = $1`,
      [invoiceId]
    );

    expect(invoiceRow.rows[0]!.status).toBe('FINANCING_REQUESTED');
    expect(invoiceRow.rows[0]!.buyer_signature).toBe(
      'sha256-integration-test-buyer-signature-abc'
    );

    // Step 9: Verify ledger has exactly one debit entry for the advance
    const ledgerResult = await pool.query<{
      entry_type:      string;
      amount_cents:    string;   // pg returns BIGINT as string
      idempotency_key: string;
    }>(
      `SELECT entry_type, amount_cents, idempotency_key
       FROM ledger_entries
       WHERE virtual_account_id = $1`,
      [van.id]
    );

    expect(ledgerResult.rows).toHaveLength(1);
    expect(ledgerResult.rows[0]!.entry_type).toBe('debit');
    expect(Number(ledgerResult.rows[0]!.amount_cents)).toBe(1_000_000);
    expect(ledgerResult.rows[0]!.idempotency_key).toBe(
      `advance-${invoiceId}`
    );
  });

  // --------------------------------------------------------------
  // SECURITY: RBAC — supplier cannot approve their own invoice
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
      });

    expect(submitRes.status).toBe(201);
    const invoiceId = submitRes.body.data.id as string;

    const approveRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ buyer_signature: 'sha256-self-approval-fraud-attempt' });

    expect(approveRes.status).toBe(403);
    expect(approveRes.body.success).toBe(false);
    expect(approveRes.body.error.code).toBe('FORBIDDEN');

    // DB must show invoice unchanged
    const row = await pool.query<{ status: string }>(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    expect(row.rows[0]!.status).toBe('SUBMITTED');
  });

  // --------------------------------------------------------------
  // STATE MACHINE: Double-approval is rejected with 409
  // --------------------------------------------------------------
  it('rejects an invalid state machine transition', async () => {
    const { supplierToken, buyerToken, buyerId } = await registerAndLogin(
      'supplier3@test.com',
      'buyer3@test.com'
    );

    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-SM-001',
        buyer_id:       buyerId,
        amount_cents:   250_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      });

    expect(submitRes.status).toBe(201);
    const invoiceId = submitRes.body.data.id as string;

    const firstApproval = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-first-sig' });

    expect(firstApproval.status).toBe(200);

    const secondApproval = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-second-sig' });

    expect(secondApproval.status).toBe(409);
    expect(secondApproval.body.error.code).toBe('INVALID_TRANSITION');
  });

  // --------------------------------------------------------------
  // RISK ENGINE: Three-way match failure cancels the invoice
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
      });

    expect(submitRes.status).toBe(201);
    const invoiceId = submitRes.body.data.id as string;

    const approveRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-risk-test-sig' });
    expect(approveRes.status).toBe(200);

    const financingRes = await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplierToken}`);
    expect(financingRes.status).toBe(200);

    // PO amount is 50% of invoice — hard fail on three-way match
    const riskRes = await api
      .post('/risk/assess')
      .send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            invoiceId,
          invoice_amount_cents:  1_000_000,
          po_amount_cents:       500_000,
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
      });

    expect(riskRes.status).toBe(422);
    expect(riskRes.body.data.decision).toBe('REJECT');
    expect(riskRes.body.data.reason_code).toBe('THREE_WAY_MATCH_FAILED');

    // Invoice must be CANCELLED in the DB
    const invoiceRow = await pool.query<{ status: string }>(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    expect(invoiceRow.rows[0]!.status).toBe('CANCELLED');

    // Audit trail must contain the rejection event
    const events = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM invoice_events
       WHERE invoice_id = $1
         AND event_type = 'risk.assessment.reject'`,
      [invoiceId]
    );
    expect(events.rows).toHaveLength(1);
  });

  // --------------------------------------------------------------
  // IDEMPOTENCY: Duplicate webhook — no double-credit
  // --------------------------------------------------------------
  it('handles duplicate payment webhooks idempotently', async () => {
    const { supplierToken, buyerToken, buyerId, supplierId }
      = await registerAndLogin('supplier5@test.com', 'buyer5@test.com');

    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        invoice_number: 'INV-IDEM-001',
        buyer_id:       buyerId,
        amount_cents:   500_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      });
    expect(submitRes.status).toBe(201);
    const invoiceId = submitRes.body.data.id as string;

    const approveRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ buyer_signature: 'sha256-idem-sig' });
    expect(approveRes.status).toBe(200);

    const financingRes = await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplierToken}`);
    expect(financingRes.status).toBe(200);

    const riskRes = await api
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
      });
    expect(riskRes.status).toBe(200);

    const vanRes = await api
      .post('/vans')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ invoice_id: invoiceId, expected_amount_cents: 500_000 });
    expect(vanRes.status).toBe(201);

    const accountNumber = vanRes.body.data.account_number as string;
    const vanId         = vanRes.body.data.id             as string;

    const webhookPayload = {
      account_number:  accountNumber,
      amount_cents:    500_000,
      idempotency_key: 'bank-txn-unique-ref-idem-001',
      paid_at:         '2026-07-01T10:00:00Z',
    };

    // First delivery — settles the account
    const first = await api
      .post('/vans/webhook/payment')
      .send(webhookPayload);

    expect(first.status).toBe(200);
    expect(first.body.data.is_fully_settled).toBe(true);

    // Second identical delivery — must return 200, no double-credit
    const second = await api
      .post('/vans/webhook/payment')
      .send(webhookPayload);

    expect(second.status).toBe(200);
    expect(second.body.message).toBe('Payment already recorded');

    // Ledger: exactly 2 entries — 1 debit advance + 1 credit payment
    const ledger = await pool.query<{ entry_type: string }>(
      `SELECT entry_type FROM ledger_entries
       WHERE virtual_account_id = $1
       ORDER BY created_at ASC`,
      [vanId]
    );

    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]!.entry_type).toBe('debit');
    expect(ledger.rows[1]!.entry_type).toBe('credit');

    // Invoice must be REPAID exactly once
    const invoiceRow = await pool.query<{ status: string }>(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    expect(invoiceRow.rows[0]!.status).toBe('REPAID');
  });

  // --------------------------------------------------------------
  // VALIDATION: Auth and input guards fire before service layer
  // --------------------------------------------------------------
  it('rejects unauthenticated requests with 401', async () => {
    const res = await api
      .post('/invoices')
      .send({ invoice_number: 'INV-UNAUTH-001' });

    expect(res.status).toBe(401);
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
        // buyer_id, amount_cents, due_date intentionally missing
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });
});