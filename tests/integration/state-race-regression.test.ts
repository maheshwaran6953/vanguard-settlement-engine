// tests/integration/state-race-regression.test.ts
//
// Regression tests for:
// - QA-007: Approval state transition concurrency race condition
// - QA-009: Financing request state transition concurrency race condition
// - QA-002: Idempotency key replay with mismatched payload

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

interface AuthTokens {
  supplierToken: string;
  buyerToken:    string;
  supplierId:    string;
  buyerId:       string;
}

async function registerAndLogin(
  supplierEmail = 'supplier.race@test.com',
  buyerEmail    = 'buyer.race@test.com'
): Promise<AuthTokens> {
  const supplierRes = await api
    .post('/auth/register')
    .send({
      legal_name: 'Race Supplier Tech Pvt Ltd',
      gstin:      '00TESTSUPPLIER1',
      role:       'supplier',
      email:      supplierEmail,
      password:   'TestPassword123!',
    });

  if (supplierRes.status !== 201) {
    throw new Error(`Supplier registration failed: ${JSON.stringify(supplierRes.body)}`);
  }

  const buyerRes = await api
    .post('/auth/register')
    .send({
      legal_name: 'Race Buyer Corp',
      role:       'buyer',
      email:      buyerEmail,
      password:   'TestPassword456!',
    });

  if (buyerRes.status !== 201) {
    throw new Error(`Buyer registration failed: ${JSON.stringify(buyerRes.body)}`);
  }

  return {
    supplierToken: supplierRes.body.data.token as string,
    buyerToken:    buyerRes.body.data.token as string,
    supplierId:    supplierRes.body.data.organisation.id as string,
    buyerId:       buyerRes.body.data.organisation.id as string,
  };
}

describe('State Transition Race Condition & Idempotency Regressions (M8 Group A)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await pool.end();
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });

  // =========================================================================
  // QA-007: Concurrent Buyer Approvals
  // =========================================================================
  it('prevents concurrent approval races across 10 parallel requests repeated 5 times (QA-007)', async () => {
    const { supplierToken, buyerToken, buyerId } = await registerAndLogin();

    for (let iteration = 1; iteration <= 5; iteration++) {
      // 1. Create a fresh SUBMITTED invoice
      const invoiceRes = await api
        .post('/invoices')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({
          invoice_number: `INV-APP-RACE-${iteration}`,
          buyer_id:       buyerId,
          amount_cents:   500_000,
          currency:       'INR',
          due_date:       '2026-12-31',
        })
        .expect(201);

      const invoiceId = invoiceRes.body.data.id as string;

      // 2. Fire 10 simultaneous approvals with different signatures
      const parallelRequests = Array.from({ length: 10 }, (_, index) =>
        api
          .post(`/invoices/${invoiceId}/approve`)
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({ buyer_signature: `DigitalSignature-${iteration}-${index}` })
      );

      const responses = await Promise.all(parallelRequests);

      const successResponses = responses.filter((r) => r.status === 200);
      const conflictResponses = responses.filter((r) => r.status === 409);

      // Exactly 1 must succeed with 200, exactly 9 must fail with 409
      expect(successResponses.length).toBe(1);
      expect(conflictResponses.length).toBe(9);

      for (const res of conflictResponses) {
        expect(res.body.error?.code).toBe('INVALID_TRANSITION');
      }

      // 3. Verify exactly 1 approval event in invoice_events
      const eventCountRes = await pool.query<{ count: string }>(
        `SELECT count(*) FROM invoice_events
         WHERE invoice_id = $1 AND event_type = 'invoice.buyer_approved'`,
        [invoiceId]
      );
      expect(Number(eventCountRes.rows[0]!.count)).toBe(1);

      // 4. Verify DB status is BUYER_APPROVED
      const statusRes = await pool.query<{ status: string }>(
        `SELECT status FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      expect(statusRes.rows[0]!.status).toBe('BUYER_APPROVED');
    }
  }, 30_000);

  // =========================================================================
  // QA-009: Concurrent Supplier Financing Requests
  // =========================================================================
  it('prevents concurrent financing request races across 10 parallel requests repeated 5 times (QA-009)', async () => {
    const { supplierToken, buyerToken, buyerId } = await registerAndLogin();

    for (let iteration = 1; iteration <= 5; iteration++) {
      // 1. Create a fresh SUBMITTED invoice
      const invoiceRes = await api
        .post('/invoices')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({
          invoice_number: `INV-FIN-RACE-${iteration}`,
          buyer_id:       buyerId,
          amount_cents:   750_000,
          currency:       'INR',
          due_date:       '2026-12-31',
        })
        .expect(201);

      const invoiceId = invoiceRes.body.data.id as string;

      // 2. Approve invoice to reach BUYER_APPROVED status
      await api
        .post(`/invoices/${invoiceId}/approve`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ buyer_signature: `ValidBuyerSignature-${iteration}` })
        .expect(200);

      // 3. Fire 10 simultaneous financing requests from supplier
      const parallelRequests = Array.from({ length: 10 }, () =>
        api
          .post(`/invoices/${invoiceId}/request-financing`)
          .set('Authorization', `Bearer ${supplierToken}`)
          .send({})
      );

      const responses = await Promise.all(parallelRequests);

      const successResponses = responses.filter((r) => r.status === 200);
      const conflictResponses = responses.filter((r) => r.status === 409);

      // Exactly 1 must succeed with 200, exactly 9 must fail with 409
      expect(successResponses.length).toBe(1);
      expect(conflictResponses.length).toBe(9);

      for (const res of conflictResponses) {
        expect(res.body.error?.code).toBe('INVALID_TRANSITION');
      }

      // 4. Verify exactly 1 financing_requested event in invoice_events
      const eventCountRes = await pool.query<{ count: string }>(
        `SELECT count(*) FROM invoice_events
         WHERE invoice_id = $1 AND event_type = 'invoice.financing_requested'`,
        [invoiceId]
      );
      expect(Number(eventCountRes.rows[0]!.count)).toBe(1);

      // 5. Verify DB status is FINANCING_REQUESTED
      const statusRes = await pool.query<{ status: string }>(
        `SELECT status FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      expect(statusRes.rows[0]!.status).toBe('FINANCING_REQUESTED');
    }
  }, 30_000);

  // =========================================================================
  // QA-002: Idempotency Fingerprint Mismatch
  // =========================================================================
  it('rejects Idempotency-Key reuse with different body with 422 IDEMPOTENCY_KEY_REUSED (QA-002)', async () => {
    const { supplierToken, buyerId } = await registerAndLogin();
    const idemKey = 'idem-race-test-diff-body-001';

    // 1. Initial request with original payload
    const initialRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .set('Idempotency-Key', idemKey)
      .send({
        invoice_number: 'INV-ORIGINAL-001',
        buyer_id:       buyerId,
        amount_cents:   100_000,
        currency:       'INR',
        due_date:       '2026-12-31',
      })
      .expect(201);

    const originalInvoiceId = initialRes.body.data.id as string;

    // 2. Replay with SAME key but DIFFERENT payload
    const replayRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .set('Idempotency-Key', idemKey)
      .send({
        invoice_number: 'INV-MALICIOUS-REPLAY',
        buyer_id:       buyerId,
        amount_cents:   999_999,
        currency:       'INR',
        due_date:       '2026-12-31',
      });

    expect(replayRes.status).toBe(422);
    expect(replayRes.body.success).toBe(false);
    expect(replayRes.body.error?.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(replayRes.header['idempotent-replayed']).toBeUndefined();

    // 3. Confirm original invoice in database is completely unchanged
    const dbInvoice = await pool.query<{ invoice_number: string; amount_cents: string }>(
      `SELECT invoice_number, amount_cents FROM invoices WHERE id = $1`,
      [originalInvoiceId]
    );
    expect(dbInvoice.rows[0]!.invoice_number).toBe('INV-ORIGINAL-001');
    expect(Number(dbInvoice.rows[0]!.amount_cents)).toBe(100_000);

    // Confirm no second invoice was inserted
    const countRes = await pool.query<{ count: string }>(
      `SELECT count(*) FROM invoices`
    );
    expect(Number(countRes.rows[0]!.count)).toBe(1);
  });

  // =========================================================================
  // Idempotency Match: Same Key, Same Body
  // =========================================================================
  it('returns cached response with Idempotent-Replayed header for same key and identical body', async () => {
    const { supplierToken, buyerId } = await registerAndLogin();
    const idemKey = 'idem-race-test-same-body-002';

    const payload = {
      invoice_number: 'INV-SAME-BODY-002',
      buyer_id:       buyerId,
      amount_cents:   250_000,
      currency:       'INR',
      due_date:       '2026-12-31',
    };

    // 1. Initial request
    const firstRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .set('Idempotency-Key', idemKey)
      .send(payload)
      .expect(201);

    expect(firstRes.header['idempotent-replayed']).toBeUndefined();

    // 2. Replay with identical body (even with rearranged keys in JSON)
    const secondRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierToken}`)
      .set('Idempotency-Key', idemKey)
      .send({
        due_date:       '2026-12-31',
        amount_cents:   250_000,
        currency:       'INR',
        buyer_id:       buyerId,
        invoice_number: 'INV-SAME-BODY-002',
      })
      .expect(201);

    expect(secondRes.header['idempotent-replayed']).toBe('true');
    expect(secondRes.body.data.id).toBe(firstRes.body.data.id);
    expect(secondRes.body.data.invoice_number).toBe('INV-SAME-BODY-002');
  });
});
