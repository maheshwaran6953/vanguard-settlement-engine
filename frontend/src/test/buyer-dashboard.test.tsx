import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BuyerDashboard } from '../pages/dashboards/BuyerDashboard';
import { AuthProvider } from '../context/AuthContext';
import { apiClient, VSE_STORAGE_KEYS } from '../api/client';
import { Invoice } from '../api/types';

describe('Buyer Dashboard Component', () => {
  const mockInvoices: Invoice[] = [
    {
      id: 'inv-sub-1',
      invoice_number: 'INV-M5-001',
      supplier_id: 'supp-org-1234',
      buyer_id: 'buyer-org-5678',
      amount_cents: '1500000', // ₹15,000.00
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'SUBMITTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-app-2',
      invoice_number: 'INV-M5-002',
      supplier_id: 'supp-org-1234',
      buyer_id: 'buyer-org-5678',
      amount_cents: '2500000', // ₹25,000.00
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'BUYER_APPROVED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-rep-3',
      invoice_number: 'INV-M5-003',
      supplier_id: 'supp-org-9999',
      buyer_id: 'buyer-org-5678',
      amount_cents: '5000000', // ₹50,000.00
      currency: 'INR',
      due_date: '2026-11-30',
      status: 'REPAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'mock-buyer-jwt');
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, 'buyer');
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, 'buyer-org-5678');
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, 'Omega Retailers Pvt Ltd');

    vi.spyOn(apiClient, 'get').mockResolvedValue(mockInvoices);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all four summary metric cards with correct labels and tooltips', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <BuyerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    // Card 1: Awaiting Approval (found in card and filter tabs)
    expect((await screen.findAllByText('Awaiting Approval')).length).toBeGreaterThanOrEqual(1);
    // Card 2: Approved (found in card and filter tabs)
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    // Card 3: Total Approved Value
    expect(screen.getByText('Total Approved Value')).toBeDefined();
    // Card 4: Total Paid
    expect(screen.getByText('Total Paid')).toBeDefined();

    // Verify tooltips
    const approvedValueTooltips = screen.getAllByTitle(
      'Includes invoices in BUYER_APPROVED, FINANCING_REQUESTED, FUNDED, and REPAID statuses.'
    );
    expect(approvedValueTooltips.length).toBeGreaterThanOrEqual(1);

    const totalPaidTooltips = screen.getAllByTitle(
      'Includes REPAID invoices only. Does not include partial payments or over-payments.'
    );
    expect(totalPaidTooltips.length).toBeGreaterThanOrEqual(1);
  });

  it('renders buyer invoices table with supplier name, invoice number, and formatted amount', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <BuyerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('INV-M5-001')).toBeDefined();
    expect(screen.getByText('INV-M5-002')).toBeDefined();
    expect(screen.getByText('INV-M5-003')).toBeDefined();

    // Check formatted amounts (₹50,000 appears in both row and Total Paid summary card)
    expect(screen.getByText('₹15,000.00')).toBeDefined();
    expect(screen.getByText('₹25,000.00')).toBeDefined();
    expect(screen.getAllByText('₹50,000.00').length).toBeGreaterThanOrEqual(1);
  });

  it('filters invoices by status tabs: All, Awaiting Approval, Approved, Settled', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <BuyerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    await screen.findByText('INV-M5-001');

    // Click "Awaiting Approval" tab
    const awaitingTab = screen.getByRole('button', { name: 'Awaiting Approval' });
    fireEvent.click(awaitingTab);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/invoices?limit=10&offset=0&status=SUBMITTED');
    });

    // Click "Approved" tab
    const approvedTab = screen.getByRole('button', { name: 'Approved' });
    fireEvent.click(approvedTab);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/invoices?limit=10&offset=0&status=BUYER_APPROVED');
    });

    // Click "Settled" tab
    const settledTab = screen.getByRole('button', { name: 'Settled' });
    fireEvent.click(settledTab);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/invoices?limit=10&offset=0&status=REPAID');
    });
  });

  it('shows Review & Approve action button for SUBMITTED invoices', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <BuyerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    await screen.findByText('INV-M5-001');

    // Only 1 invoice is SUBMITTED, so only 1 "Review & Approve" button
    const reviewButtons = screen.getAllByRole('link', { name: /review & approve/i });
    expect(reviewButtons.length).toBe(1);
    expect(reviewButtons[0]?.getAttribute('href')).toBe('/buyer/invoices/inv-sub-1/approve');
  });

  it('shows View Details action button for all invoices', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <BuyerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    await screen.findByText('INV-M5-001');

    const detailButtons = screen.getAllByRole('link', { name: /view details/i });
    // All 3 invoices have a View Details link
    expect(detailButtons.length).toBe(3);
    expect(detailButtons[0]?.getAttribute('href')).toBe('/invoices/inv-sub-1');
  });
});
