import path from 'path';
import dotenv from 'dotenv';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

dotenv.config({
  path: path.resolve(__dirname, '../../infra/config/.env.test'),
  override: true,
});

import supertest from 'supertest';
import { buildApp } from '../../services/app';
import { pool } from '../../core/database/pool';
import { vanService } from '../../core/database/container';
import { JOB_TYPES } from '../../infra/queue/registry';

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

let vanGstinCounter = 1;

async function setupInvoiceAndVan(amountCents: number): Promise<{
  invoiceId:     string;
  vanId:         string;
  accountNumber: string;
  supplierToken: string;
  buyerToken:    string;
}> {
  const supRes = await api.post('/auth/register').send({
    legal_name: 'Test Supplier ' + Date.now() + Math.random(),
    gstin:      `00TESTSUPPLIER${(vanGstinCounter++ % 10)}`,
    role:       'supplier',
    email:      `sup-${Date.now()}-${Math.floor(Math.random() * 100000)}@test.com`,
    password:   'TestPassword123!',
  });
  const supplierToken = supRes.body.data.token as string;
  const supplierId    = supRes.body.data.organisation.id as string;

  const buyRes = await api.post('/auth/register').send({
    legal_name: 'Test Buyer ' + Date.now() + Math.random(),
    role:       'buyer',
    email:      `buy-${Date.now()}-${Math.floor(Math.random() * 100000)}@test.com`,
    password:   'TestPassword123!',
  });
  const buyerToken = buyRes.body.data.token as string;
  const buyerId    = buyRes.body.data.organisation.id as string;

  const invRes = await api
    .post('/invoices')
    .set('Authorization', `Bearer ${supplierToken}`)
    .send({
      buyer_id:       buyerId,
      invoice_number: `INV-M2-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      amount_cents:   amountCents,
      due_date:       '2026-12-31',
    });
  const invoiceId = invRes.body.data.id as string;

  await api
    .post(`/invoices/${invoiceId}/approve`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ buyer_signature: 'DIGITAL-SIG-M2' });

  await api
    .post(`/invoices/${invoiceId}/request-financing`)
    .set('Authorization', `Bearer ${supplierToken}`)
    .send({});

  await api.post('/risk/assess').send({
    invoice_id: invoiceId,
    three_way_match_input: {
      invoice_id:            invoiceId,
      invoice_amount_cents:  amountCents,
      po_amount_cents:       amountCents,
      delivery_amount_cents: amountCents,
      po_number:             'PO-M2-001',
      delivery_receipt_id:   'DR-M2-001',
    },
    anomaly_signals: {
      invoice_id:               invoiceId,
      buyer_id:                 buyerId,
      supplier_id:              supplierId,
      amount_cents:             amountCents,
      due_date:                 '2026-12-31',
      submitted_at:             new Date().toISOString(),
      avg_invoice_amount_cents: amountCents,
      days_until_due:           90,
      prior_default_count:      0,
    },
  });

  const vanRes = await api
    .post('/vans')
    .set('Authorization', `Bearer ${supplierToken}`)
    .send({ invoice_id: invoiceId, expected_amount_cents: amountCents });

  return {
    invoiceId,
    vanId:         vanRes.body.data.id as string,
    accountNumber: vanRes.body.data.account_number as string,
    supplierToken,
    buyerToken,
  };
}

describe('Module M2: Partial and Over-payment Settlement', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await pool.end();
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });

  it('handles partial payment of 60%: VAN partially_settled, invoice FUNDED, 1 credit ledger entry', async () => {
    const expectedAmount = 1_000_000; // 10,000 INR in paise
    const partialAmount  = 600_000;   // 60%

    const addSpy = jest.spyOn(vanService['documentQueue'], 'add');

    const { invoiceId, vanId, accountNumber } = await setupInvoiceAndVan(expectedAmount);

    const paymentRes = await api
      .post('/vans/webhook/payment')
      .send({
        account_number:  accountNumber,
        amount_cents:    partialAmount,
        idempotency_key: 'm2-partial-60-pct-key',
        paid_at:         new Date().toISOString(),
      });

    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.success).toBe(true);
    expect(paymentRes.body.data.virtual_account.status).toBe('partially_settled');
    expect(Number(paymentRes.body.data.virtual_account.received_amount_cents)).toBe(partialAmount);
    expect(paymentRes.body.data.is_fully_settled).toBe(false);

    // Verify invoice status in DB remains FUNDED
    const invRow = await pool.query<{ status: string }>(
      'SELECT status FROM invoices WHERE id = $1',
      [invoiceId]
    );
    expect(invRow.rows[0]!.status).toBe('FUNDED');

    // Verify ledger entries in DB: 1 debit (advance) + 1 credit (partial payment)
    const ledger = await pool.query<{ entry_type: string; amount_cents: string }>(
      'SELECT entry_type, amount_cents FROM ledger_entries WHERE virtual_account_id = $1 ORDER BY created_at ASC',
      [vanId]
    );
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]!.entry_type).toBe('debit');
    expect(ledger.rows[1]!.entry_type).toBe('credit');
    expect(Number(ledger.rows[1]!.amount_cents)).toBe(partialAmount);

    // Verify van.partially_settled event was emitted with received and remaining amounts in paise
    const events = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
      'SELECT event_type, payload FROM invoice_events WHERE invoice_id = $1 ORDER BY occurred_at ASC',
      [invoiceId]
    );
    const partialEvent = events.rows.find((e) => e.event_type === 'van.partially_settled');
    expect(partialEvent).toBeDefined();
    expect(partialEvent!.payload.received_amount_cents).toBe(600_000);
    expect(partialEvent!.payload.remaining_amount_cents).toBe(400_000);
    expect(partialEvent!.payload.virtual_account_id).toBe(vanId);
    expect(partialEvent!.payload.idempotency_key).toBe('m2-partial-60-pct-key');

    // Verify receipt PDF job is NOT enqueued for partial payment
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('completes settlement on second payment of remaining 40%: VAN settled, invoice REPAID, receipt job enqueued', async () => {
    const expectedAmount = 1_000_000;
    const firstPayment   = 600_000; // 60%
    const secondPayment  = 400_000; // 40%

    const { invoiceId, vanId, accountNumber } = await setupInvoiceAndVan(expectedAmount);

    // 1st payment: 60%
    const firstRes = await api
      .post('/vans/webhook/payment')
      .send({
        account_number:  accountNumber,
        amount_cents:    firstPayment,
        idempotency_key: 'm2-completion-first-payment-key',
        paid_at:         new Date().toISOString(),
      });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.virtual_account.status).toBe('partially_settled');

    // 2nd payment: remaining 40%
    const addSpy = jest.spyOn(vanService['documentQueue'], 'add');

    const secondRes = await api
      .post('/vans/webhook/payment')
      .send({
        account_number:  accountNumber,
        amount_cents:    secondPayment,
        idempotency_key: 'm2-completion-second-payment-key',
        paid_at:         new Date().toISOString(),
      });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.success).toBe(true);
    expect(secondRes.body.data.virtual_account.status).toBe('settled');
    expect(Number(secondRes.body.data.virtual_account.received_amount_cents)).toBe(expectedAmount);
    expect(secondRes.body.data.is_fully_settled).toBe(true);

    // Verify invoice moves to REPAID in DB
    const invRow = await pool.query<{ status: string }>(
      'SELECT status FROM invoices WHERE id = $1',
      [invoiceId]
    );
    expect(invRow.rows[0]!.status).toBe('REPAID');

    // Verify ledger: 1 debit advance + 2 credits
    const ledger = await pool.query<{ entry_type: string; amount_cents: string }>(
      'SELECT entry_type, amount_cents FROM ledger_entries WHERE virtual_account_id = $1 ORDER BY created_at ASC',
      [vanId]
    );
    expect(ledger.rows).toHaveLength(3);
    expect(ledger.rows[0]!.entry_type).toBe('debit');
    expect(ledger.rows[1]!.entry_type).toBe('credit');
    expect(Number(ledger.rows[1]!.amount_cents)).toBe(firstPayment);
    expect(ledger.rows[2]!.entry_type).toBe('credit');
    expect(Number(ledger.rows[2]!.amount_cents)).toBe(secondPayment);

    // Verify invoice.repaid event emitted
    const events = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
      'SELECT event_type, payload FROM invoice_events WHERE invoice_id = $1 ORDER BY occurred_at ASC',
      [invoiceId]
    );
    const repaidEvent = events.rows.find((e) => e.event_type === 'invoice.repaid');
    expect(repaidEvent).toBeDefined();
    expect(repaidEvent!.payload.virtual_account_id).toBe(vanId);

    // Verify receipt PDF job is enqueued
    expect(addSpy).toHaveBeenCalledWith(
      JOB_TYPES.SETTLEMENT_RECEIPT_PDF,
      expect.objectContaining({ invoice_id: invoiceId }),
      { jobId: `receipt-${invoiceId}` }
    );
    addSpy.mockRestore();
  });

  it('handles over-payment of 120%: VAN over_paid, invoice REPAID, invoice.over_paid event with excess and requires_manual_review', async () => {
    const expectedAmount = 500_000; // 5,000 INR
    const paymentAmount  = 600_000; // 120% (6,000 INR)
    const excessAmount   = 100_000; // 20% excess

    const addSpy = jest.spyOn(vanService['documentQueue'], 'add');

    const { invoiceId, vanId, accountNumber } = await setupInvoiceAndVan(expectedAmount);

    const paymentRes = await api
      .post('/vans/webhook/payment')
      .send({
        account_number:  accountNumber,
        amount_cents:    paymentAmount,
        idempotency_key: 'm2-overpayment-120-pct-key',
        paid_at:         new Date().toISOString(),
      });

    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.success).toBe(true);
    expect(paymentRes.body.data.virtual_account.status).toBe('over_paid');
    expect(Number(paymentRes.body.data.virtual_account.received_amount_cents)).toBe(paymentAmount);
    expect(paymentRes.body.data.is_fully_settled).toBe(false);

    // Verify invoice is REPAID in DB
    const invRow = await pool.query<{ status: string }>(
      'SELECT status FROM invoices WHERE id = $1',
      [invoiceId]
    );
    expect(invRow.rows[0]!.status).toBe('REPAID');

    // Verify ledger: 1 debit advance + 1 credit over-payment
    const ledger = await pool.query<{ entry_type: string; amount_cents: string }>(
      'SELECT entry_type, amount_cents FROM ledger_entries WHERE virtual_account_id = $1 ORDER BY created_at ASC',
      [vanId]
    );
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]!.entry_type).toBe('debit');
    expect(ledger.rows[1]!.entry_type).toBe('credit');
    expect(Number(ledger.rows[1]!.amount_cents)).toBe(paymentAmount);

    // Verify invoice.over_paid event payload
    const events = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
      'SELECT event_type, payload FROM invoice_events WHERE invoice_id = $1 ORDER BY occurred_at ASC',
      [invoiceId]
    );
    const overPaidEvent = events.rows.find((e) => e.event_type === 'invoice.over_paid');
    expect(overPaidEvent).toBeDefined();
    expect(overPaidEvent!.payload.virtual_account_id).toBe(vanId);
    expect(overPaidEvent!.payload.expected_amount_cents).toBe(expectedAmount);
    expect(overPaidEvent!.payload.received_amount_cents).toBe(paymentAmount);
    expect(overPaidEvent!.payload.excess_cents).toBe(excessAmount);
    expect(overPaidEvent!.payload.requires_manual_review).toBe(true);
    expect(overPaidEvent!.payload.idempotency_key).toBe('m2-overpayment-120-pct-key');

    // Verify receipt PDF job is enqueued
    expect(addSpy).toHaveBeenCalledWith(
      JOB_TYPES.SETTLEMENT_RECEIPT_PDF,
      expect.objectContaining({ invoice_id: invoiceId }),
      { jobId: `receipt-${invoiceId}` }
    );
    addSpy.mockRestore();
  });

  it('handles duplicate webhook keys on partially_settled VAN and on over_paid VAN: HTTP 200, no new ledger entry', async () => {
    // 1. Partially settled duplicate check
    const { vanId: partialVanId, accountNumber: partialAccount } = await setupInvoiceAndVan(1_000_000);

    const partialPayload = {
      account_number:  partialAccount,
      amount_cents:    600_000,
      idempotency_key: 'idem-partial-key-1',
      paid_at:         new Date().toISOString(),
    };

    const partial1 = await api.post('/vans/webhook/payment').send(partialPayload);
    expect(partial1.status).toBe(200);
    expect(partial1.body.data.virtual_account.status).toBe('partially_settled');

    // Resend identical webhook on partially_settled VAN
    const partial2 = await api.post('/vans/webhook/payment').send(partialPayload);
    expect(partial2.status).toBe(200);
    expect(partial2.body.success).toBe(true);
    expect(partial2.body.message).toBe('Payment already recorded');

    // Ledger for partially_settled VAN must have exactly 2 entries (1 debit + 1 credit)
    const partialLedger = await pool.query(
      'SELECT id FROM ledger_entries WHERE virtual_account_id = $1',
      [partialVanId]
    );
    expect(partialLedger.rows).toHaveLength(2);

    // 2. Over-paid duplicate check
    const { vanId: overPaidVanId, accountNumber: overPaidAccount } = await setupInvoiceAndVan(500_000);

    const overPaidPayload = {
      account_number:  overPaidAccount,
      amount_cents:    600_000,
      idempotency_key: 'idem-overpaid-key-1',
      paid_at:         new Date().toISOString(),
    };

    const overPaid1 = await api.post('/vans/webhook/payment').send(overPaidPayload);
    expect(overPaid1.status).toBe(200);
    expect(overPaid1.body.data.virtual_account.status).toBe('over_paid');

    // Resend identical webhook on over_paid VAN
    const overPaid2 = await api.post('/vans/webhook/payment').send(overPaidPayload);
    expect(overPaid2.status).toBe(200);
    expect(overPaid2.body.success).toBe(true);
    expect(overPaid2.body.message).toBe('Payment already recorded');

    // Ledger for over_paid VAN must have exactly 2 entries (1 debit + 1 credit)
    const overPaidLedger = await pool.query(
      'SELECT id FROM ledger_entries WHERE virtual_account_id = $1',
      [overPaidVanId]
    );
    expect(overPaidLedger.rows).toHaveLength(2);
  });
});
