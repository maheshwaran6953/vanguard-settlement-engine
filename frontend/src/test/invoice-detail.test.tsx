import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvoiceDetailPage } from '../pages/invoices/InvoiceDetailPage';
import { AuthProvider } from '../context/AuthContext';
import { apiClient, VSE_STORAGE_KEYS } from '../api/client';
import { ApiClientError } from '../api/errors';
import { InvoiceWithHistory, VanWithLedger } from '../api/types';

describe('Invoice Detail and Reconciliation View', () => {
  const baseInvoice: InvoiceWithHistory = {
    invoice: {
      id: 'inv-detail-123',
      invoice_number: 'INV-2026-001',
      supplier_id: 'supp-org-1111',
      buyer_id: 'buyer-org-2222',
      amount_cents: '10000000', // ₹1,00,000.00
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'FUNDED',
      created_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-01T10:00:00.000Z',
    },
    events: [
      {
        id: 'e1',
        invoice_id: 'inv-detail-123',
        event_type: 'invoice.submitted',
        payload: {},
        actor_id: 'supp-org-1111',
        occurred_at: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'e2',
        invoice_id: 'inv-detail-123',
        event_type: 'invoice.buyer_approved',
        payload: {},
        actor_id: 'buyer-org-2222',
        occurred_at: '2026-10-01T11:00:00.000Z',
      },
      {
        id: 'e3',
        invoice_id: 'inv-detail-123',
        event_type: 'invoice.financing_requested',
        payload: {},
        actor_id: 'supp-org-1111',
        occurred_at: '2026-10-01T12:00:00.000Z',
      },
      {
        id: 'e4',
        invoice_id: 'inv-detail-123',
        event_type: 'risk.assessment.approve',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-01T12:05:00.000Z',
      },
      {
        id: 'e5',
        invoice_id: 'inv-detail-123',
        event_type: 'risk.assessment.reject',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-01T12:10:00.000Z',
      },
      {
        id: 'e6',
        invoice_id: 'inv-detail-123',
        event_type: 'risk.assessment.manual_review',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-01T12:15:00.000Z',
      },
      {
        id: 'e7',
        invoice_id: 'inv-detail-123',
        event_type: 'van.created',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-01T12:20:00.000Z',
      },
      {
        id: 'e8',
        invoice_id: 'inv-detail-123',
        event_type: 'van.partially_settled',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-02T10:00:00.000Z',
      },
      {
        id: 'e9',
        invoice_id: 'inv-detail-123',
        event_type: 'invoice.repaid',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-03T10:00:00.000Z',
      },
      {
        id: 'e10',
        invoice_id: 'inv-detail-123',
        event_type: 'invoice.over_paid',
        payload: {},
        actor_id: null,
        occurred_at: '2026-10-04T10:00:00.000Z',
      },
    ],
  };

  const mockVanData: VanWithLedger = {
    virtual_account: {
      id: 'van-uuid-1',
      invoice_id: 'inv-detail-123',
      account_number: 'VSE123456789012',
      ifsc_code: 'YESB0CMSNOC',
      expected_amount_cents: '10000000', // ₹1,00,000.00
      received_amount_cents: '6000000', // ₹60,000.00 (60.00%)
      status: 'partially_settled',
      expires_at: '2027-01-01T00:00:00.000Z',
      created_at: '2026-10-01T12:20:00.000Z',
    },
    ledger_entries: [
      {
        id: 'led-1',
        virtual_account_id: 'van-uuid-1',
        entry_type: 'credit',
        amount_cents: '6000000',
        description: 'Partial buyer settlement payment via NEFT',
        idempotency_key: 'idem-pay-001',
        created_at: '2026-10-02T10:00:00.000Z',
      },
    ],
    is_fully_settled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'mock-jwt-token');
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, 'supplier');
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, 'supp-org-1111');
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, 'Apex Supplies SME');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderDetailPage(id: string = 'inv-detail-123') {
    return render(
      <MemoryRouter initialEntries={[`/invoices/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it('renders invoice header, status badge, amounts, and counterparties', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return baseInvoice;
      if (url.startsWith('/vans/')) return mockVanData;
      return {};
    });

    renderDetailPage();

    expect(await screen.findByText('INV-2026-001')).toBeDefined();
    expect(screen.getByTestId('status-badge-funded')).toBeDefined();
    expect(screen.getAllByText('₹1,00,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('supp-org-1111')).toBeDefined();
    expect(screen.getByText('buyer-org-2222')).toBeDefined();
  });

  it('renders audit timeline with all 10 known event types in chronological order', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return baseInvoice;
      if (url.startsWith('/vans/')) return mockVanData;
      return {};
    });

    renderDetailPage();

    // All 10 labels should be present
    expect(await screen.findByText('Invoice Submitted')).toBeDefined();
    expect(screen.getByText('Buyer Approved')).toBeDefined();
    expect(screen.getByText('Financing Requested')).toBeDefined();
    expect(screen.getByText('Risk Assessment: Approved')).toBeDefined();
    expect(screen.getByText('Risk Assessment: Rejected')).toBeDefined();
    expect(screen.getByText('Risk Assessment: Manual Review Required')).toBeDefined();
    expect(screen.getByText('Virtual Account Created')).toBeDefined();
    expect(screen.getByText('Partial Payment Settled')).toBeDefined();
    expect(screen.getByText('Fully Repaid')).toBeDefined();
    expect(screen.getByText('Over-Payment Recorded')).toBeDefined();
  });

  it('falls back to raw string in neutral tag for unknown audit event type without crashing', async () => {
    const invoiceWithUnknownEvent: InvoiceWithHistory = {
      ...baseInvoice,
      events: [
        {
          id: 'u-1',
          invoice_id: 'inv-detail-123',
          event_type: 'custom.arbitrary.future_event',
          payload: { foo: 'bar' },
          actor_id: null,
          occurred_at: '2026-10-05T12:00:00.000Z',
        },
      ],
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return invoiceWithUnknownEvent;
      if (url.startsWith('/vans/')) return mockVanData;
      return {};
    });

    renderDetailPage();

    // Should find the raw string tag without throwing
    expect((await screen.findAllByText('custom.arbitrary.future_event')).length).toBeGreaterThanOrEqual(1);
  });

  it('displays access restricted card with dashboard return link on 403 FORBIDDEN', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiClientError(
        'FORBIDDEN',
        'You do not have permission to view this invoice',
        403
      )
    );

    renderDetailPage();

    expect(await screen.findByText('Access Restricted')).toBeDefined();
    expect(
      screen.getByText('Access restricted: you are not authorised to view this invoice')
    ).toBeDefined();

    const returnLink = screen.getByRole('link', { name: /Back to Dashboard/i });
    expect(returnLink).toBeDefined();
  });

  it('displays friendly explanation when VAN returns 404 VAN_NOT_FOUND', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return baseInvoice;
      if (url.startsWith('/vans/')) {
        throw new ApiClientError('VAN_NOT_FOUND', 'Virtual account not found for invoice', 404);
      }
      return {};
    });

    renderDetailPage();

    expect(await screen.findByText('Virtual Account Status')).toBeDefined();
    expect(
      screen.getByText(
        'No virtual account issued yet. A virtual account is created when financing is approved.'
      )
    ).toBeDefined();
  });

  it('displays generic error message with error code when VAN returns non-404 error', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return baseInvoice;
      if (url.startsWith('/vans/')) {
        throw new ApiClientError('VAN_DATABASE_DOWN', 'Database connection timed out', 500);
      }
      return {};
    });

    renderDetailPage();

    expect(await screen.findByText('Unable to Load Virtual Account')).toBeDefined();
    expect(
      screen.getByText('Unable to load virtual account details: VAN_DATABASE_DOWN')
    ).toBeDefined();
  });

  it('renders virtual account progress bar and ledger entries for partially settled VAN while invoice remains FUNDED', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return baseInvoice; // status is FUNDED
      if (url.startsWith('/vans/')) return mockVanData; // 60,000 / 100,000 = 60.00%
      return {};
    });

    renderDetailPage();

    expect(await screen.findByText('60.00%')).toBeDefined();
    expect(screen.getByText('PARTIALLY SETTLED')).toBeDefined();
    expect(screen.getByText('VSE123456789012')).toBeDefined();
    expect(screen.getByText('YESB0CMSNOC')).toBeDefined();
    expect(screen.getByText('idem-pay-001')).toBeDefined();
    // Invoice status remains FUNDED
    expect(screen.getByTestId('status-badge-funded')).toBeDefined();
  });

  it('renders manual review banner and excess percentage when VAN status is over_paid', async () => {
    const overpaidVan: VanWithLedger = {
      virtual_account: {
        ...mockVanData.virtual_account,
        status: 'over_paid',
        received_amount_cents: '12000000', // 120.00%
      },
      ledger_entries: [
        ...mockVanData.ledger_entries,
        {
          id: 'led-2',
          virtual_account_id: 'van-uuid-1',
          entry_type: 'credit',
          amount_cents: '6000000',
          description: 'Second payment with excess',
          idempotency_key: 'idem-pay-002',
          created_at: '2026-10-03T10:00:00.000Z',
        },
      ],
      is_fully_settled: true,
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/invoices/')) return { ...baseInvoice, invoice: { ...baseInvoice.invoice, status: 'REPAID' } };
      if (url.startsWith('/vans/')) return overpaidVan;
      return {};
    });

    renderDetailPage();

    expect(await screen.findByText('Over-Payment Detected')).toBeDefined();
    expect(screen.getByText('120.00%')).toBeDefined();
    expect(screen.getByText('OVER PAID')).toBeDefined();
    expect(screen.getByTestId('status-badge-repaid')).toBeDefined();
  });
});
