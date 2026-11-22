import { describe, it, expect } from 'vitest';
import { computeBuyerSummaryMetrics } from '../pages/dashboards/BuyerDashboard';
import { Invoice } from '../api/types';

function createMockInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv-test-id',
    invoice_number: 'INV-TEST-001',
    supplier_id: 'supp-test-id',
    buyer_id: 'buyer-test-id',
    amount_cents: '1000000',
    currency: 'INR',
    due_date: '2026-12-31',
    status: 'SUBMITTED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Buyer Summary Math', () => {
  it('calculates awaiting approval count for SUBMITTED invoices', () => {
    const invoices: Invoice[] = [
      createMockInvoice({ id: '1', status: 'SUBMITTED' }),
      createMockInvoice({ id: '2', status: 'SUBMITTED' }),
      createMockInvoice({ id: '3', status: 'BUYER_APPROVED' }),
      createMockInvoice({ id: '4', status: 'FUNDED' }),
    ];

    const metrics = computeBuyerSummaryMetrics(invoices);
    expect(metrics.awaitingApproval).toBe(2);
  });

  it('calculates approved count for BUYER_APPROVED invoices', () => {
    const invoices: Invoice[] = [
      createMockInvoice({ id: '1', status: 'SUBMITTED' }),
      createMockInvoice({ id: '2', status: 'BUYER_APPROVED' }),
      createMockInvoice({ id: '3', status: 'BUYER_APPROVED' }),
      createMockInvoice({ id: '4', status: 'REPAID' }),
    ];

    const metrics = computeBuyerSummaryMetrics(invoices);
    expect(metrics.approved).toBe(2);
  });

  it('calculates total approved value summing BUYER_APPROVED, FINANCING_REQUESTED, FUNDED, and REPAID invoices using BigInt', () => {
    const invoices: Invoice[] = [
      createMockInvoice({ id: '1', status: 'SUBMITTED', amount_cents: '500000' }), // excluded
      createMockInvoice({ id: '2', status: 'BUYER_APPROVED', amount_cents: '1000000' }), // included
      createMockInvoice({ id: '3', status: 'FINANCING_REQUESTED', amount_cents: '2000000' }), // included
      createMockInvoice({ id: '4', status: 'FUNDED', amount_cents: '3000000' }), // included
      createMockInvoice({ id: '5', status: 'REPAID', amount_cents: '4000000' }), // included
    ];

    const metrics = computeBuyerSummaryMetrics(invoices);
    // 1000000 + 2000000 + 3000000 + 4000000 = 10000000 paise (₹1,00,000)
    expect(metrics.totalApprovedValuePaise).toBe(10000000n);
  });

  it('excludes SUBMITTED and REJECTED invoices from total approved value', () => {
    const invoices: Invoice[] = [
      createMockInvoice({ id: '1', status: 'SUBMITTED', amount_cents: '7500000' }),
      createMockInvoice({ id: '2', status: 'DRAFT', amount_cents: '2500000' }),
      createMockInvoice({ id: '3', status: 'CANCELLED', amount_cents: '1000000' }),
    ];

    const metrics = computeBuyerSummaryMetrics(invoices);
    expect(metrics.totalApprovedValuePaise).toBe(0n);
  });

  it('calculates total paid summing REPAID invoices only using BigInt', () => {
    const invoices: Invoice[] = [
      createMockInvoice({ id: '1', status: 'SUBMITTED', amount_cents: '1000000' }),
      createMockInvoice({ id: '2', status: 'BUYER_APPROVED', amount_cents: '2000000' }),
      createMockInvoice({ id: '3', status: 'FUNDED', amount_cents: '3000000' }),
      createMockInvoice({ id: '4', status: 'REPAID', amount_cents: '4500000' }),
      createMockInvoice({ id: '5', status: 'REPAID', amount_cents: '5500000' }),
    ];

    const metrics = computeBuyerSummaryMetrics(invoices);
    // Only REPAID: 4500000 + 5500000 = 10000000 paise (₹1,00,000)
    expect(metrics.totalPaidPaise).toBe(10000000n);
  });

  it('excludes partial payments and over-payments from total paid figure', () => {
    // Invoices that are still FUNDED (even if partially paid at the VAN layer)
    // are not counted towards total paid until fully REPAID
    const invoices: Invoice[] = [
      createMockInvoice({ id: '1', status: 'FUNDED', amount_cents: '6000000' }),
      createMockInvoice({ id: '2', status: 'REPAID', amount_cents: '2000000' }),
    ];

    const metrics = computeBuyerSummaryMetrics(invoices);
    // Only id: 2 is REPAID
    expect(metrics.totalPaidPaise).toBe(2000000n);
  });

  it('handles empty invoice list with 0 counts and 0 paise amounts', () => {
    const metrics = computeBuyerSummaryMetrics([]);
    expect(metrics.awaitingApproval).toBe(0);
    expect(metrics.approved).toBe(0);
    expect(metrics.totalApprovedValuePaise).toBe(0n);
    expect(metrics.totalPaidPaise).toBe(0n);
  });
});
