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

let gstinCounter = 1;

async function registerOrg(
  name: string,
  role: 'supplier' | 'buyer',
  email: string
): Promise<{ token: string; id: string }> {
  const payload: Record<string, unknown> = {
    legal_name: name,
    role,
    email,
    password: 'TestPassword123!',
  };
  if (role === 'supplier') {
    payload.gstin = `00TESTSUPPLIER${(gstinCounter++ % 10)}`;
  }

  const res = await api
    .post('/auth/register')
    .send(payload);

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

describe('Module M5a: Invoice Read Ownership (GET /invoices/:id)', () => {
  let supplierA: { token: string; id: string };
  let buyerA:    { token: string; id: string };
  let supplierB: { token: string; id: string };
  let buyerB:    { token: string; id: string };
  let admin:     { token: string; id: string };
  let invoiceId: string;

  beforeEach(async () => {
    await cleanDatabase();

    supplierA = await registerOrg('Supplier Alpha SME', 'supplier', 'suppA@test.com');
    buyerA    = await registerOrg('Buyer Omega Corp', 'buyer', 'buyerA@test.com');
    supplierB = await registerOrg('Supplier Beta SME', 'supplier', 'suppB@test.com');
    buyerB    = await registerOrg('Buyer Delta Corp', 'buyer', 'buyerB@test.com');
    admin     = await createAdminUser();

    // Submit invoice for supplierA -> buyerA
    const submitRes = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${supplierA.token}`)
      .send({
        invoice_number: 'INV-M5A-001',
        buyer_id: buyerA.id,
        amount_cents: 1000000,
        currency: 'INR',
        due_date: '2026-12-31',
      })
      .expect(201);

    invoiceId = submitRes.body.data.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  it('supplier of the invoice can read it (200)', async () => {
    const res = await api
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${supplierA.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice.id).toBe(invoiceId);
    expect(res.body.data.invoice.supplier_id).toBe(supplierA.id);
    expect(res.body.data.invoice.buyer_id).toBe(buyerA.id);
    expect(Array.isArray(res.body.data.events)).toBe(true);
    expect(res.body.data.events.length).toBeGreaterThanOrEqual(1);
  });

  it('buyer of the invoice can read it (200)', async () => {
    const res = await api
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${buyerA.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice.id).toBe(invoiceId);
    expect(res.body.data.invoice.supplier_id).toBe(supplierA.id);
    expect(res.body.data.invoice.buyer_id).toBe(buyerA.id);
    expect(Array.isArray(res.body.data.events)).toBe(true);
  });

  it('a different supplier gets 404', async () => {
    const res = await api
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${supplierB.token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(res.body.error.message).toBe(`Invoice not found: ${invoiceId}`);
  });

  it('a different buyer gets 404', async () => {
    const res = await api
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${buyerB.token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    expect(res.body.error.message).toBe(`Invoice not found: ${invoiceId}`);
  });

  it('platform_admin can read it (200)', async () => {
    const res = await api
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice.id).toBe(invoiceId);
    expect(Array.isArray(res.body.data.events)).toBe(true);
  });

  it('unknown ID gives 404 for an authenticated caller', async () => {
    const unknownId = 'a0000000-0000-0000-0000-000000000000';
    const res = await api
      .get(`/invoices/${unknownId}`)
      .set('Authorization', `Bearer ${supplierA.token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
  });
});
