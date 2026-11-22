import path from 'path';
import dotenv from 'dotenv';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import supertest from 'supertest';

dotenv.config({
  path: path.resolve(__dirname, '../../infra/config/.env.test'),
  override: true,
});

import { buildApp } from '../../services/app';
import { pool } from '../../core/database/pool';

const app = buildApp();
const api = supertest(app);

const VALID_GSTIN_1 = '29ABCDE1234F1Z5';
const VALID_GSTIN_2 = '27AABCB1512P1Z8';

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

async function registerSupplier(
  name: string,
  email: string,
  gstin?: string
): Promise<supertest.Response> {
  const payload: Record<string, unknown> = {
    legal_name: name,
    role: 'supplier',
    email,
    password: 'TestPassword123!',
  };
  if (gstin !== undefined) {
    payload.gstin = gstin;
  }
  return api.post('/auth/register').send(payload);
}

async function registerBuyer(
  name: string,
  email: string,
  gstin?: string
): Promise<supertest.Response> {
  const payload: Record<string, unknown> = {
    legal_name: name,
    role: 'buyer',
    email,
    password: 'TestPassword123!',
  };
  if (gstin !== undefined) {
    payload.gstin = gstin;
  }
  return api.post('/auth/register').send(payload);
}

describe('Module M8 Group B: Validation and Information Disclosure Regression Tests', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  describe('QA-001: GSTIN requirement on supplier registration', () => {
    it('rejects supplier registration without GSTIN with 400 VALIDATION_ERROR', async () => {
      const res = await registerSupplier('GSTIN-less Supplier', 'supp_no_gstin@test.com');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toHaveProperty('gstin');
    });

    it('accepts supplier registration with a valid 15-character GSTIN (201)', async () => {
      const res = await registerSupplier('Valid Supplier', 'supp_valid@test.com', VALID_GSTIN_1);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organisation.role).toBe('supplier');
    });

    it('allows buyer registration without GSTIN (optional for buyers)', async () => {
      const res = await registerBuyer('Buyer Corp', 'buyer_no_gstin@test.com');
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organisation.role).toBe('buyer');
    });
  });

  describe('QA-003: Whitespace-only invoice_number validation', () => {
    it('returns 400 VALIDATION_ERROR for whitespace-only invoice_number and creates no row', async () => {
      const supRes = await registerSupplier('Sup A', 'sup_inv03@test.com', VALID_GSTIN_1);
      const buyRes = await registerBuyer('Buy A', 'buy_inv03@test.com');
      const supplierToken = supRes.body.data.token as string;
      const buyerId = buyRes.body.data.organisation.id as string;

      const res = await api
        .post('/invoices')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({
          invoice_number: '   \t  \n  ',
          buyer_id: buyerId,
          amount_cents: 100000,
          currency: 'INR',
          due_date: '2027-01-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const countResult = await pool.query<{ count: string }>('SELECT COUNT(*) FROM invoices');
      expect(parseInt(countResult.rows[0]!.count, 10)).toBe(0);
    });
  });

  describe('QA-004: Prevent invoices from naming a supplier organisation as buyer', () => {
    it('returns 400 INVALID_COUNTERPARTY when buyer_id belongs to a supplier, creating no row', async () => {
      const supRes1 = await registerSupplier('Supplier One', 'sup1_inv04@test.com', VALID_GSTIN_1);
      const supRes2 = await registerSupplier('Supplier Two', 'sup2_inv04@test.com', VALID_GSTIN_2);
      const supplierToken = supRes1.body.data.token as string;
      const invalidBuyerId = supRes2.body.data.organisation.id as string;

      const res = await api
        .post('/invoices')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({
          invoice_number: 'INV-SUP-AS-BUYER-001',
          buyer_id: invalidBuyerId,
          amount_cents: 500000,
          currency: 'INR',
          due_date: '2027-01-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_COUNTERPARTY');

      const countResult = await pool.query<{ count: string }>('SELECT COUNT(*) FROM invoices');
      expect(parseInt(countResult.rows[0]!.count, 10)).toBe(0);
    });
  });

  describe('QA-005: Information leak prevention on invoice read', () => {
    it('returns 404 INVOICE_NOT_FOUND to unpermitted callers identical to a random UUID', async () => {
      const supRes1 = await registerSupplier('Owner Supplier', 'sup_owner@test.com', VALID_GSTIN_1);
      const buyRes1 = await registerBuyer('Owner Buyer', 'buy_owner@test.com');
      const supRes2 = await registerSupplier('Attacker Supplier', 'sup_attacker@test.com', VALID_GSTIN_2);

      const ownerToken = supRes1.body.data.token as string;
      const buyerId = buyRes1.body.data.organisation.id as string;
      const attackerToken = supRes2.body.data.token as string;

      const submitRes = await api
        .post('/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          invoice_number: 'INV-QA005-SECRET',
          buyer_id: buyerId,
          amount_cents: 250000,
          currency: 'INR',
          due_date: '2027-01-01',
        })
        .expect(201);

      const existingInvoiceId = submitRes.body.data.id as string;
      const nonExistentId = 'b0000000-0000-0000-0000-000000000000';

      const existingRes = await api
        .get(`/invoices/${existingInvoiceId}`)
        .set('Authorization', `Bearer ${attackerToken}`);

      const randomRes = await api
        .get(`/invoices/${nonExistentId}`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(existingRes.status).toBe(404);
      expect(existingRes.body.success).toBe(false);
      expect(existingRes.body.error.code).toBe('INVOICE_NOT_FOUND');

      expect(randomRes.status).toBe(404);
      expect(randomRes.body.success).toBe(false);
      expect(randomRes.body.error.code).toBe('INVOICE_NOT_FOUND');
    });
  });

  describe('QA-006: Sanitize PostgreSQL error details in error handler', () => {
    it('returns clean 400 INVALID_INPUT without PostgreSQL driver text for malformed UUID', async () => {
      const supRes = await registerSupplier('Sup QA006', 'sup_qa006@test.com', VALID_GSTIN_1);
      const token = supRes.body.data.token as string;

      const res = await api
        .get('/invoices/not-a-valid-uuid-string')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
      expect(res.body.error.message).not.toContain('invalid input syntax for type uuid');
      expect(res.body.error.message).not.toContain('pg');
    });
  });

  describe('QA-008: Buyer signature maximum length constraint', () => {
    it('returns 400 VALIDATION_ERROR when signature exceeds 1024 characters', async () => {
      const supRes = await registerSupplier('Sup QA008', 'sup_qa008@test.com', VALID_GSTIN_1);
      const buyRes = await registerBuyer('Buy QA008', 'buy_qa008@test.com');
      const supplierToken = supRes.body.data.token as string;
      const buyerToken = buyRes.body.data.token as string;
      const buyerId = buyRes.body.data.organisation.id as string;

      const submitRes = await api
        .post('/invoices')
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({
          invoice_number: 'INV-QA008-001',
          buyer_id: buyerId,
          amount_cents: 300000,
          currency: 'INR',
          due_date: '2027-01-01',
        })
        .expect(201);

      const invoiceId = submitRes.body.data.id as string;
      const giantSignature = 'A'.repeat(5000);

      const res = await api
        .post(`/invoices/${invoiceId}/approve`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          buyer_signature: giantSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
