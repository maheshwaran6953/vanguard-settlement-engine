// tests/integration/blocker-regression.test.ts
//
// Regression tests for:
// - QA-021 (Blocker): Access control on GET /vans/:invoiceId (supplier, buyer, platform_admin only; others receive 404)
// - QA-018 (Critical): Webhook signature mismatch returns fixed error message without disclosing expected signature

import path from 'path';
import dotenv from 'dotenv';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';

dotenv.config({
  path: path.resolve(__dirname, '../../infra/config/.env.test'),
  override: true,
});

import supertest from 'supertest';
import { buildApp } from '../../services/app';
import { pool } from '../../core/database/pool';
import { env } from '../../core/config/env';

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

let counter = 100;

async function registerOrg(
  name: string,
  role: 'supplier' | 'buyer',
  email: string
): Promise<{ token: string; id: string }> {
  const c = counter++;
  const payload: Record<string, unknown> = {
    legal_name: name,
    role,
    email,
    password: 'TestPassword123!',
  };
  if (role === 'supplier') {
    payload.gstin = `00TESTSUPP${c.toString().padStart(5, '0')}`;
  }

  const res = await api.post('/auth/register').send(payload);
  if (res.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.token as string,
    id: res.body.data.organisation.id as string,
  };
}

async function createAdminUser(): Promise<{ token: string; id: string }> {
  const orgResult = await pool.query<{ id: string }>(
    `INSERT INTO organisations (legal_name, org_type)
     VALUES ('Vanguard Platform Admin Org', 'platform')
     RETURNING id`
  );
  const orgId = orgResult.rows[0]!.id;

  const token = jwt.sign(
    {
      sub: orgId,
      org_id: orgId,
      role: 'platform_admin',
      email: 'admin@vanguard.test',
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { token, id: orgId };
}

describe('Blocker & Critical Regression Suite (QA-021 & QA-018)', () => {
  let supplier:   { token: string; id: string };
  let buyer:      { token: string; id: string };
  let thirdParty: { token: string; id: string };
  let admin:      { token: string; id: string };
  let invoiceId:  string;
  let vanAccount: string;

  beforeEach(async () => {
    await cleanDatabase();

    supplier   = await registerOrg('Supplier Alpha SME', 'supplier', `supp.${Date.now()}.${counter}@test.com`);
    buyer      = await registerOrg('Buyer Omega Corp', 'buyer', `buyer.${Date.now()}.${counter}@test.com`);
    thirdParty = await registerOrg('Third Party Corp', 'supplier', `third.${Date.now()}.${counter}@test.com`);
    admin      = await createAdminUser();

    // 1. Create invoice in SUBMITTED
    const invRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplier.token}`)
      .send({
        invoice_number: `INV-REG-${counter++}`,
        buyer_id:       buyer.id,
        amount_cents:   1_000_000,
        currency:       'INR',
        due_date:       new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    expect(invRes.status).toBe(201);
    invoiceId = invRes.body.data.id;

    // 2. Buyer approve
    const appRes = await api
      .post(`/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ buyer_signature: 'StandardBuyerSignatureValid1234567890' });
    expect(appRes.status).toBe(200);

    // 3. Supplier request financing
    const finRes = await api
      .post(`/invoices/${invoiceId}/request-financing`)
      .set('Authorization', `Bearer ${supplier.token}`)
      .send({});
    expect(finRes.status).toBe(200);

    // 4. Risk assessment APPROVE
    const riskRes = await api
      .post('/risk/assess')
      .set('Authorization', `Bearer ${supplier.token}`)
      .send({
        invoice_id: invoiceId,
        three_way_match_input: {
          invoice_id:            invoiceId,
          invoice_amount_cents:  1_000_000,
          po_amount_cents:       1_000_000,
          delivery_amount_cents: 1_000_000,
          po_number:             'PO-REG-001',
          delivery_receipt_id:   'DR-REG-001',
        },
        anomaly_signals: {
          invoice_id:               invoiceId,
          buyer_id:                 buyer.id,
          supplier_id:              supplier.id,
          amount_cents:             1_000_000,
          due_date:                 new Date(Date.now() + 30 * 86400000).toISOString(),
          submitted_at:             new Date().toISOString(),
          avg_invoice_amount_cents: 1_000_000,
          days_until_due:           30,
          prior_default_count:      0,
        },
      });
    expect(riskRes.status).toBe(200);

    // 5. Create VAN
    const vanRes = await api
      .post('/vans')
      .set('Authorization', `Bearer ${supplier.token}`)
      .send({
        invoice_id:            invoiceId,
        expected_amount_cents: 1_000_000,
      });
    expect(vanRes.status).toBe(201);
    vanAccount = vanRes.body.data.account_number;
  });

  afterAll(async () => {
    await pool.end();
  });

  // ----------------------------------------------------------------
  // QA-021: Access Control on GET /vans/:invoiceId
  // ----------------------------------------------------------------

  it('supplier of the invoice reads its VAN: 200', async () => {
    const res = await api
      .get(`/vans/${invoiceId}`)
      .set('Authorization', `Bearer ${supplier.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.virtual_account.account_number).toBe(vanAccount);
    expect(Array.isArray(res.body.data.ledger_entries)).toBe(true);
  });

  it('buyer of the invoice reads its VAN: 200', async () => {
    const res = await api
      .get(`/vans/${invoiceId}`)
      .set('Authorization', `Bearer ${buyer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.virtual_account.account_number).toBe(vanAccount);
  });

  it('third-party organisation reads the VAN: 404 VAN_NOT_FOUND', async () => {
    const res = await api
      .get(`/vans/${invoiceId}`)
      .set('Authorization', `Bearer ${thirdParty.token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VAN_NOT_FOUND');
    expect(res.body.error.message).toBe(`Virtual account not found: ${invoiceId}`);
  });

  it('platform_admin reads the VAN: 200', async () => {
    const res = await api
      .get(`/vans/${invoiceId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.virtual_account.account_number).toBe(vanAccount);
  });

  it('unknown invoice ID: 404 VAN_NOT_FOUND', async () => {
    const unknownId = 'a0000000-0000-0000-0000-000000000000';
    const res = await api
      .get(`/vans/${unknownId}`)
      .set('Authorization', `Bearer ${supplier.token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VAN_NOT_FOUND');
    expect(res.body.error.message).toBe(`Virtual account not found: ${unknownId}`);
  });

  // ----------------------------------------------------------------
  // QA-018: Webhook Signature Mismatch Message Leak Guard
  // ----------------------------------------------------------------

  it('webhook with a wrong signature: 401 INVALID_WEBHOOK_SIGNATURE, and the response body contains no hex string of 64 characters', async () => {
    const wrongSignature = 'a'.repeat(64); // 64 hex chars of wrong signature
    const payload = {
      account_number:  vanAccount,
      amount_cents:    1_000_000,
      idempotency_key: `test-whk-wrong-${Date.now()}`,
      paid_at:         new Date().toISOString(),
    };

    const res = await api
      .post('/vans/webhook/payment')
      .set('X-Webhook-Signature', wrongSignature)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    expect(res.body.error.message).toBe('Webhook signature verification failed');

    // Confirm response body string contains no 64-character hex digest
    const bodyStr = JSON.stringify(res.body);
    const hex64Regex = /[0-9a-fA-F]{64}/;
    expect(hex64Regex.test(bodyStr)).toBe(false);
  });
});
