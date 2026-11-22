// tests/integration/group-c-defects.test.ts
//
// Regression test suite for Group C defects:
// - QA-010: buyer_signature length bounded to 500 characters
// - QA-011: single terminal risk assessment and concurrency race guard (10 parallel x 5 iterations)
// - QA-012: three_way_match_input.invoice_id must match top-level invoice_id
// - QA-013: creating a VAN transitions invoice status to FUNDED
// - QA-014: creating a VAN requires stored APPROVE risk decision (blocks unassessed and MANUAL_REVIEW)
// - QA-015: creating a VAN rejects mismatched expected_amount_cents with 400 AMOUNT_MISMATCH
// - QA-016: creating a VAN on invalid invoice status returns 409 INVALID_TRANSITION

import path   from 'path';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import dotenv from 'dotenv';

dotenv.config({
  path:     path.resolve(__dirname, '../../infra/config/.env.test'),
  override: true,
});

import supertest    from 'supertest';
import { buildApp } from '../../services/app';
import { pool }     from '../../core/database/pool';

const app = buildApp();
const api = supertest(app);

async function cleanDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      invoice_events,
      ledger_entries,
      virtual_accounts,
      invoices,
      idempotency_keys,
      organisation_credentials,
      organisations
    RESTART IDENTITY CASCADE;
  `);
}

let regCounter = 100;
async function registerActors() {
  const c = regCounter++;
  const supEmail = `supplier.c.${c}@test.com`;
  const buyEmail = `buyer.c.${c}@test.com`;
  const gstin    = `00TESTSUPP${c.toString().padStart(5, '0')}`; // 15 chars

  const supRes = await api.post('/auth/register').send({
    legal_name: `Group C Supplier ${c}`,
    gstin,
    role:       'supplier',
    email:      supEmail,
    password:   'TestPassword123!',
  });
  expect(supRes.status).toBe(201);

  const buyRes = await api.post('/auth/register').send({
    legal_name: `Group C Buyer ${c}`,
    role:       'buyer',
    email:      buyEmail,
    password:   'TestPassword123!',
  });
  expect(buyRes.status).toBe(201);

  return {
    supplierToken: supRes.body.data.token as string,
    buyerToken:    buyRes.body.data.token as string,
    supplierId:    supRes.body.data.organisation.id as string,
    buyerId:       buyRes.body.data.organisation.id as string,
  };
}

async function createSubmittedInvoice(
  supplierToken: string,
  buyerId: string,
  amountCents = 1_000_000,
  invoiceNumber?: string
): Promise<string> {
  const invNum = invoiceNumber ?? `INV-C-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const res = await api
    .post('/invoices')
    .set('Authorization', `Bearer ${supplierToken}`)
    .send({
      invoice_number: invNum,
      buyer_id:       buyerId,
      amount_cents:   amountCents,
      currency:       'INR',
      due_date:       dueDate.toISOString(),
    });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function createApprovedInvoice(
  supplierToken: string,
  buyerToken: string,
  buyerId: string,
  amountCents = 1_000_000
): Promise<string> {
  const invoiceId = await createSubmittedInvoice(supplierToken, buyerId, amountCents);
  const approveRes = await api
    .post(`/invoices/${invoiceId}/approve`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ buyer_signature: 'StandardBuyerSig1234567890' });
  expect(approveRes.status).toBe(200);
  return invoiceId;
}

async function createFinancingRequestedInvoice(
  supplierToken: string,
  buyerToken: string,
  buyerId: string,
  amountCents = 1_000_000
): Promise<string> {
  const invoiceId = await createApprovedInvoice(supplierToken, buyerToken, buyerId, amountCents);
  const finRes = await api
    .post(`/invoices/${invoiceId}/request-financing`)
    .set('Authorization', `Bearer ${supplierToken}`)
    .send({});
  expect(finRes.status).toBe(200);
  return invoiceId;
}

async function assessInvoiceClean(
  invoiceId: string,
  supplierId: string,
  buyerId: string,
  amountCents = 1_000_000
) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  return api.post('/risk/assess').send({
    invoice_id: invoiceId,
    three_way_match_input: {
      invoice_id:            invoiceId,
      invoice_amount_cents:  amountCents,
      po_amount_cents:       amountCents,
      delivery_amount_cents: amountCents,
      po_number:             `PO-${invoiceId.slice(0, 8)}`,
      delivery_receipt_id:   `DR-${invoiceId.slice(0, 8)}`,
    },
    anomaly_signals: {
      invoice_id:               invoiceId,
      buyer_id:                 buyerId,
      supplier_id:              supplierId,
      amount_cents:             amountCents,
      due_date:                 dueDate.toISOString(),
      submitted_at:             new Date().toISOString(),
      avg_invoice_amount_cents: amountCents,
      days_until_due:           30,
      prior_default_count:      0,
    },
  });
}

describe('Module M8 Group C Defect Fixes', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  // -------------------------------------------------------------
  // QA-010: buyer_signature length bounded to 500 characters
  // -------------------------------------------------------------
  describe('QA-010: buyer_signature length validation', () => {
    it('rejects 501-character buyer_signature with 400 VALIDATION_ERROR and accepts 500 characters with 200', async () => {
      const { supplierToken, buyerToken, buyerId } = await registerActors();
      const invoiceId = await createSubmittedInvoice(supplierToken, buyerId);

      // 501 characters -> must fail
      const sig501 = 'a'.repeat(501);
      const res501 = await api
        .post(`/invoices/${invoiceId}/approve`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ buyer_signature: sig501 });

      expect(res501.status).toBe(400);
      expect(res501.body.success).toBe(false);
      expect(res501.body.error.code).toBe('VALIDATION_ERROR');

      // 500 characters -> must succeed
      const sig500 = 'b'.repeat(500);
      const res500 = await api
        .post(`/invoices/${invoiceId}/approve`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ buyer_signature: sig500 });

      expect(res500.status).toBe(200);
      expect(res500.body.success).toBe(true);
      expect(res500.body.data.status).toBe('BUYER_APPROVED');
    });
  });

  // -------------------------------------------------------------
  // QA-011: single terminal risk assessment and concurrency race guard
  // Promise.all with at least 10 parallel requests repeated 5 times
  // -------------------------------------------------------------
  describe('QA-011: single terminal risk assessment concurrency race', () => {
    for (let iteration = 1; iteration <= 5; iteration++) {
      it(`prevents duplicate risk assessment under concurrency (iteration ${iteration}/5: 10 parallel requests)`, async () => {
        const { supplierToken, buyerToken, supplierId, buyerId } = await registerActors();
        const invoiceId = await createFinancingRequestedInvoice(supplierToken, buyerToken, buyerId);

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const buildRiskRequest = () =>
          api.post('/risk/assess').send({
            invoice_id: invoiceId,
            three_way_match_input: {
              invoice_id:            invoiceId,
              invoice_amount_cents:  1_000_000,
              po_amount_cents:       1_000_000,
              delivery_amount_cents: 1_000_000,
              po_number:             `PO-RACE-${iteration}`,
              delivery_receipt_id:   `DR-RACE-${iteration}`,
            },
            anomaly_signals: {
              invoice_id:               invoiceId,
              buyer_id:                 buyerId,
              supplier_id:              supplierId,
              amount_cents:             1_000_000,
              due_date:                 dueDate.toISOString(),
              submitted_at:             new Date().toISOString(),
              avg_invoice_amount_cents: 1_000_000,
              days_until_due:           30,
              prior_default_count:      0,
            },
          });

        // Fire 10 parallel requests simultaneously
        const responses = await Promise.all([
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
          buildRiskRequest(),
        ]);

        const successes = responses.filter((r) => r.status === 200);
        const conflicts = responses.filter((r) => r.status === 409);

        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(9);

        conflicts.forEach((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('INVOICE_ALREADY_ASSESSED');
        });

        // Exactly 1 decision event stored in invoice_events
        const eventsRes = await pool.query<{ event_type: string }>(
          `SELECT event_type FROM invoice_events
           WHERE invoice_id = $1 AND event_type LIKE 'risk.assessment.%'`,
          [invoiceId]
        );
        expect(eventsRes.rows).toHaveLength(1);
        expect(eventsRes.rows[0]?.event_type).toBe('risk.assessment.approve');
      });
    }
  });

  // -------------------------------------------------------------
  // QA-012: three_way_match_input.invoice_id parity validation
  // -------------------------------------------------------------
  describe('QA-012: document mismatch rejection', () => {
    it('rejects risk assessment when three_way_match_input.invoice_id differs from top-level invoice_id', async () => {
      const { supplierToken, buyerToken, supplierId, buyerId } = await registerActors();
      const invoiceId = await createFinancingRequestedInvoice(supplierToken, buyerToken, buyerId);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const res = await api.post('/risk/assess').send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            'a0000000-0000-0000-0000-000000000000', // mismatched!
          invoice_amount_cents:  1_000_000,
          po_amount_cents:       1_000_000,
          delivery_amount_cents: 1_000_000,
          po_number:             'PO-MISMATCH-001',
          delivery_receipt_id:   'DR-MISMATCH-001',
        },
        anomaly_signals: {
          invoice_id:               invoiceId,
          buyer_id:                 buyerId,
          supplier_id:              supplierId,
          amount_cents:             1_000_000,
          due_date:                 dueDate.toISOString(),
          submitted_at:             new Date().toISOString(),
          avg_invoice_amount_cents: 1_000_000,
          days_until_due:           30,
          prior_default_count:      0,
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------
  // QA-013: creating a VAN transitions invoice status to FUNDED
  // -------------------------------------------------------------
  describe('QA-013: invoice status transition to FUNDED on VAN creation', () => {
    it('transitions invoice to FUNDED atomically when virtual account is created', async () => {
      const { supplierToken, buyerToken, supplierId, buyerId } = await registerActors();
      const invoiceId = await createFinancingRequestedInvoice(supplierToken, buyerToken, buyerId, 1_000_000);

      const riskRes = await assessInvoiceClean(invoiceId, supplierId, buyerId, 1_000_000);
      expect(riskRes.status).toBe(200);

      const vanRes = await api
        .post('/vans')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({ invoice_id: invoiceId, expected_amount_cents: 1_000_000 });

      expect(vanRes.status).toBe(201);
      expect(vanRes.body.data.status).toBe('active');

      // Verify invoice status in DB transitioned to FUNDED
      const dbInv = await pool.query<{ status: string }>('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
      expect(dbInv.rows[0]?.status).toBe('FUNDED');

      // Verify events in DB contain both risk.assessment.approve and van.created
      const events = await pool.query<{ event_type: string }>(
        'SELECT event_type FROM invoice_events WHERE invoice_id = $1 ORDER BY occurred_at ASC',
        [invoiceId]
      );
      const types = events.rows.map((r) => r.event_type);
      expect(types).toContain('risk.assessment.approve');
      expect(types).toContain('van.created');
    });
  });

  // -------------------------------------------------------------
  // QA-014: creating a VAN requires stored APPROVE risk decision
  // -------------------------------------------------------------
  describe('QA-014: require stored APPROVE decision for VAN creation', () => {
    it('rejects VAN creation with 409 RISK_ASSESSMENT_NOT_APPROVED when risk assessment was never run', async () => {
      const { supplierToken, buyerToken, buyerId } = await registerActors();
      const invoiceId = await createFinancingRequestedInvoice(supplierToken, buyerToken, buyerId, 1_000_000);

      const vanRes = await api
        .post('/vans')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({ invoice_id: invoiceId, expected_amount_cents: 1_000_000 });

      expect(vanRes.status).toBe(409);
      expect(vanRes.body.success).toBe(false);
      expect(vanRes.body.error.code).toBe('RISK_ASSESSMENT_NOT_APPROVED');

      // Verify no virtual account was created
      const countRes = await pool.query('SELECT COUNT(*)::int as count FROM virtual_accounts WHERE invoice_id = $1', [invoiceId]);
      expect(countRes.rows[0]?.count).toBe(0);
    });

    it('rejects VAN creation with 409 RISK_ASSESSMENT_NOT_APPROVED when risk decision is MANUAL_REVIEW', async () => {
      const { supplierToken, buyerToken, supplierId, buyerId } = await registerActors();
      const invoiceId = await createFinancingRequestedInvoice(supplierToken, buyerToken, buyerId, 3_000_000);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10); // 10 days until due -> SHORT_PAYMENT_TERM (+10)

      // Anomaly spike 200% above average (+20) -> total score 30 -> MANUAL_REVIEW
      const riskRes = await api.post('/risk/assess').send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            invoiceId,
          invoice_amount_cents:  3_000_000,
          po_amount_cents:       3_000_000,
          delivery_amount_cents: 3_000_000,
          po_number:             'PO-MANUAL-001',
          delivery_receipt_id:   'DR-MANUAL-001',
        },
        anomaly_signals: {
          invoice_id:               invoiceId,
          buyer_id:                 buyerId,
          supplier_id:              supplierId,
          amount_cents:             3_000_000,
          due_date:                 dueDate.toISOString(),
          submitted_at:             new Date().toISOString(),
          avg_invoice_amount_cents: 1_000_000, // 200% spike
          days_until_due:           10,
          prior_default_count:      0,
        },
      });

      expect(riskRes.status).toBe(202);
      expect(riskRes.body.data.decision).toBe('MANUAL_REVIEW');

      // VAN creation must be blocked
      const vanRes = await api
        .post('/vans')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({ invoice_id: invoiceId, expected_amount_cents: 3_000_000 });

      expect(vanRes.status).toBe(409);
      expect(vanRes.body.success).toBe(false);
      expect(vanRes.body.error.code).toBe('RISK_ASSESSMENT_NOT_APPROVED');
    });
  });

  // -------------------------------------------------------------
  // QA-015: reject mismatched expected_amount_cents with 400 AMOUNT_MISMATCH
  // -------------------------------------------------------------
  describe('QA-015: validate expected_amount_cents equals invoice.amount_cents', () => {
    it('rejects VAN creation when expected_amount_cents differs from invoice amount_cents', async () => {
      const { supplierToken, buyerToken, supplierId, buyerId } = await registerActors();
      const invoiceId = await createFinancingRequestedInvoice(supplierToken, buyerToken, buyerId, 1_000_000);

      const riskRes = await assessInvoiceClean(invoiceId, supplierId, buyerId, 1_000_000);
      expect(riskRes.status).toBe(200);

      // Attempt to disburse 800,000 instead of 1,000,000
      const vanRes = await api
        .post('/vans')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({ invoice_id: invoiceId, expected_amount_cents: 800_000 });

      expect(vanRes.status).toBe(400);
      expect(vanRes.body.success).toBe(false);
      expect(vanRes.body.error.code).toBe('AMOUNT_MISMATCH');

      // Verify no row created in virtual_accounts or ledger_entries
      const vanCount = await pool.query('SELECT COUNT(*)::int as count FROM virtual_accounts WHERE invoice_id = $1', [invoiceId]);
      expect(vanCount.rows[0]?.count).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // QA-016: return 409 INVALID_TRANSITION on invalid invoice status
  // -------------------------------------------------------------
  describe('QA-016: invalid invoice status returns 409 INVALID_TRANSITION', () => {
    it('returns 409 INVALID_TRANSITION when creating a VAN for a SUBMITTED invoice', async () => {
      const { supplierToken, buyerId } = await registerActors();
      const invoiceId = await createSubmittedInvoice(supplierToken, buyerId, 1_000_000);

      const vanRes = await api
        .post('/vans')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({ invoice_id: invoiceId, expected_amount_cents: 1_000_000 });

      expect(vanRes.status).toBe(409);
      expect(vanRes.body.success).toBe(false);
      expect(vanRes.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('returns 409 INVALID_TRANSITION when creating a VAN for a BUYER_APPROVED invoice', async () => {
      const { supplierToken, buyerToken, buyerId } = await registerActors();
      const invoiceId = await createApprovedInvoice(supplierToken, buyerToken, buyerId, 1_000_000);

      const vanRes = await api
        .post('/vans')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({ invoice_id: invoiceId, expected_amount_cents: 1_000_000 });

      expect(vanRes.status).toBe(409);
      expect(vanRes.body.success).toBe(false);
      expect(vanRes.body.error.code).toBe('INVALID_TRANSITION');
    });
  });
});
