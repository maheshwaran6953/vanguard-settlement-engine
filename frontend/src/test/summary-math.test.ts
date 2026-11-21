import { describe, it, expect } from 'vitest';
import { computeSummaryMetrics } from '../pages/dashboards/SupplierDashboard';
import { Invoice } from '../api/types';
import { formatPaiseToInr } from '../utils/currency';

describe('Dashboard Summary Math', () => {
  // Test fixture using ONLY string values for amount_cents matching the backend API
  const fixtureInvoices: Invoice[] = [
    {
      id: 'inv-1',
      invoice_number: 'INV-001',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '1000050', // ₹10,000.50 - FUNDED
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'FUNDED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-2',
      invoice_number: 'INV-002',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '5000000', // ₹50,000.00 - REPAID
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'REPAID',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-3',
      invoice_number: 'INV-003',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '2500000', // ₹25,000.00 - SUBMITTED
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'SUBMITTED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-4',
      invoice_number: 'INV-004',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '1500000', // ₹15,000.00 - SUBMITTED
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'SUBMITTED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-5',
      invoice_number: 'INV-005',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '3000000', // ₹30,000.00 - BUYER_APPROVED (not yet financed)
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'BUYER_APPROVED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-6',
      invoice_number: 'INV-006',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '4000000', // ₹40,000.00 - FINANCING_REQUESTED (not yet funded)
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'FINANCING_REQUESTED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-7',
      invoice_number: 'INV-007',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '1000000', // CANCELLED
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'CANCELLED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'inv-8',
      invoice_number: 'INV-008',
      supplier_id: 'supp-1',
      buyer_id: 'buyer-1',
      amount_cents: '2000000', // DEFAULTED
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'DEFAULTED',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
  ];

  it('computes exact summary metrics from integer string paise fixtures', () => {
    const metrics = computeSummaryMetrics(fixtureInvoices);

    // Total invoices count
    expect(metrics.totalInvoices).toBe(8);

    // Total Financed: strictly FUNDED (1000050) + REPAID (5000000) = 6000050 paise
    expect(metrics.totalFinancedPaise).toBe(6000050n);

    // Formatted currency output checked to the exact paisa
    const formatted = formatPaiseToInr(metrics.totalFinancedPaise.toString());
    expect(formatted).toBe('₹60,000.50');

    // Awaiting Approval: count of SUBMITTED
    expect(metrics.awaitingApproval).toBe(2);

    // Active Accounts: count of FUNDED
    expect(metrics.activeAccounts).toBe(1);
  });

  it('handles empty invoice lists safely', () => {
    const metrics = computeSummaryMetrics([]);
    expect(metrics.totalInvoices).toBe(0);
    expect(metrics.totalFinancedPaise).toBe(0n);
    expect(metrics.awaitingApproval).toBe(0);
    expect(metrics.activeAccounts).toBe(0);
    expect(formatPaiseToInr(metrics.totalFinancedPaise.toString())).toBe('₹0.00');
  });
});
