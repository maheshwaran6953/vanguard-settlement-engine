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

async function registerOrg(
  name: string,
  role: 'supplier' | 'buyer',
  email: string
): Promise<{ token: string; id: string }> {
  const res = await api
    .post('/auth/register')
    .send({
      legal_name: name,
      role,
      email,
      password: 'TestPassword123!',
    });

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
     VALUES ('Vanguard Admin Org', 'platform')
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

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await pool.end();
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
});

describe('Module M1: CORS and Preflight', () => {
  it('returns CORS headers for browser preflight OPTIONS request', async () => {
    const res = await api
      .options('/invoices')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns CORS headers on GET /invoices request from frontend origin', async () => {
    const supplier = await registerOrg('Supplier CORS', 'supplier', 'cors-sup@test.com');

    const res = await api
      .get('/invoices')
      .set('Origin', 'http://localhost:5173')
      .set('Authorization', `Bearer ${supplier.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('Module M1: GET /invoices', () => {
  it('rejects unauthenticated requests with 401 MISSING_TOKEN', async () => {
    const res = await api.get('/invoices');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('scopes invoice lists to supplier role', async () => {
    const sup1 = await registerOrg('Supplier 1', 'supplier', 'sup1@test.com');
    const sup2 = await registerOrg('Supplier 2', 'supplier', 'sup2@test.com');
    const buyer = await registerOrg('Buyer 1', 'buyer', 'buyer1@test.com');

    // Supplier 1 creates an invoice
    await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup1.token}`)
      .send({
        invoice_number: 'INV-SUP1-001',
        buyer_id: buyer.id,
        amount_cents: 100_000,
        due_date: '2027-01-01',
      });

    // Supplier 2 creates an invoice
    await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup2.token}`)
      .send({
        invoice_number: 'INV-SUP2-001',
        buyer_id: buyer.id,
        amount_cents: 200_000,
        due_date: '2027-01-01',
      });

    // Supplier 1 should only see INV-SUP1-001
    const res1 = await api
      .get('/invoices')
      .set('Authorization', `Bearer ${sup1.token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.data).toHaveLength(1);
    expect(res1.body.data[0].invoice_number).toBe('INV-SUP1-001');

    // Supplier 2 should only see INV-SUP2-001
    const res2 = await api
      .get('/invoices')
      .set('Authorization', `Bearer ${sup2.token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.data[0].invoice_number).toBe('INV-SUP2-001');
  });

  it('scopes invoice lists to buyer role', async () => {
    const sup = await registerOrg('Supplier A', 'supplier', 'supA@test.com');
    const buyer1 = await registerOrg('Buyer A', 'buyer', 'buyerA@test.com');
    const buyer2 = await registerOrg('Buyer B', 'buyer', 'buyerB@test.com');

    // Invoice for Buyer 1
    await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup.token}`)
      .send({
        invoice_number: 'INV-BUYER1-001',
        buyer_id: buyer1.id,
        amount_cents: 100_000,
        due_date: '2027-01-01',
      });

    // Invoice for Buyer 2
    await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup.token}`)
      .send({
        invoice_number: 'INV-BUYER2-001',
        buyer_id: buyer2.id,
        amount_cents: 200_000,
        due_date: '2027-01-01',
      });

    // Buyer 1 should only see INV-BUYER1-001
    const resBuyer1 = await api
      .get('/invoices')
      .set('Authorization', `Bearer ${buyer1.token}`);

    expect(resBuyer1.status).toBe(200);
    expect(resBuyer1.body.data).toHaveLength(1);
    expect(resBuyer1.body.data[0].invoice_number).toBe('INV-BUYER1-001');

    // Buyer 2 should only see INV-BUYER2-001
    const resBuyer2 = await api
      .get('/invoices')
      .set('Authorization', `Bearer ${buyer2.token}`);

    expect(resBuyer2.status).toBe(200);
    expect(resBuyer2.body.data).toHaveLength(1);
    expect(resBuyer2.body.data[0].invoice_number).toBe('INV-BUYER2-001');
  });

  it('allows platform_admin to view all invoices across all organisations', async () => {
    const sup = await registerOrg('Supplier Admin Test', 'supplier', 'supadmin@test.com');
    const buyer = await registerOrg('Buyer Admin Test', 'buyer', 'buyeradmin@test.com');
    const admin = await createAdminUser();

    await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup.token}`)
      .send({
        invoice_number: 'INV-ADMIN-001',
        buyer_id: buyer.id,
        amount_cents: 100_000,
        due_date: '2027-01-01',
      });

    await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup.token}`)
      .send({
        invoice_number: 'INV-ADMIN-002',
        buyer_id: buyer.id,
        amount_cents: 200_000,
        due_date: '2027-01-01',
      });

    const resAdmin = await api
      .get('/invoices')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toHaveLength(2);
  });

  it('filters invoices by status', async () => {
    const sup = await registerOrg('Supplier Filter', 'supplier', 'supfilter@test.com');
    const buyer = await registerOrg('Buyer Filter', 'buyer', 'buyerfilter@test.com');

    // Create invoice 1 (remains SUBMITTED)
    const inv1Res = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup.token}`)
      .send({
        invoice_number: 'INV-FILTER-001',
        buyer_id: buyer.id,
        amount_cents: 100_000,
        due_date: '2027-01-01',
      });

    // Create invoice 2 and approve it (becomes BUYER_APPROVED)
    const inv2Res = await api
      .post('/invoices')
      .set('Authorization', `Bearer ${sup.token}`)
      .send({
        invoice_number: 'INV-FILTER-002',
        buyer_id: buyer.id,
        amount_cents: 200_000,
        due_date: '2027-01-01',
      });

    await api
      .post(`/invoices/${inv2Res.body.data.id}/approve`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ buyer_signature: 'signature-buyer-valid-length-123' });

    // Filter by SUBMITTED
    const resSubmitted = await api
      .get('/invoices?status=SUBMITTED')
      .set('Authorization', `Bearer ${sup.token}`);

    expect(resSubmitted.status).toBe(200);
    expect(resSubmitted.body.data).toHaveLength(1);
    expect(resSubmitted.body.data[0].invoice_number).toBe('INV-FILTER-001');

    // Filter by BUYER_APPROVED
    const resApproved = await api
      .get('/invoices?status=BUYER_APPROVED')
      .set('Authorization', `Bearer ${sup.token}`);

    expect(resApproved.status).toBe(200);
    expect(resApproved.body.data).toHaveLength(1);
    expect(resApproved.body.data[0].invoice_number).toBe('INV-FILTER-002');
  });

  it('supports pagination with limit and offset', async () => {
    const sup = await registerOrg('Supplier Page', 'supplier', 'suppage@test.com');
    const buyer = await registerOrg('Buyer Page', 'buyer', 'buyerpage@test.com');

    for (let i = 1; i <= 3; i++) {
      await api
        .post('/invoices')
        .set('Authorization', `Bearer ${sup.token}`)
        .send({
          invoice_number: `INV-PAGE-00${i}`,
          buyer_id: buyer.id,
          amount_cents: 100_000 * i,
          due_date: '2027-01-01',
        });
    }

    // limit = 2
    const page1 = await api
      .get('/invoices?limit=2&offset=0')
      .set('Authorization', `Bearer ${sup.token}`);

    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);

    // limit = 2, offset = 2
    const page2 = await api
      .get('/invoices?limit=2&offset=2')
      .set('Authorization', `Bearer ${sup.token}`);

    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(1);
  });
});

describe('Module M1: GET /organisations', () => {
  it('returns only buyer organisations with id and legal_name only', async () => {
    const sup = await registerOrg('Alpha Supplier Corp', 'supplier', 'suporg@test.com');
    await registerOrg('Beta Buyer Ltd', 'buyer', 'buyerorg1@test.com');
    await registerOrg('Gamma Buyer Inc', 'buyer', 'buyerorg2@test.com');

    const res = await api
      .get('/organisations?role=buyer')
      .set('Authorization', `Bearer ${sup.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    for (const org of res.body.data) {
      expect(org).toHaveProperty('id');
      expect(org).toHaveProperty('legal_name');
      // Assert security constraint: NEVER return credentials, passwords, or emails
      expect(org).not.toHaveProperty('password');
      expect(org).not.toHaveProperty('password_hash');
      expect(org).not.toHaveProperty('email');
      expect(org).not.toHaveProperty('role');
    }

    const names = res.body.data.map((o: { legal_name: string }) => o.legal_name);
    expect(names).toContain('Beta Buyer Ltd');
    expect(names).toContain('Gamma Buyer Inc');
    expect(names).not.toContain('Alpha Supplier Corp');
  });

  it('rejects unauthenticated request to /organisations', async () => {
    const res = await api.get('/organisations?role=buyer');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });
});
