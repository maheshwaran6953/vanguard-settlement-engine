import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApproveInvoicePage } from '../pages/buyer/ApproveInvoicePage';
import { apiClient } from '../api/client';
import { ApiClientError } from '../api/errors';
import { InvoiceWithHistory } from '../api/types';

describe('Buyer Approval Page Component', () => {
  const mockInvoiceData: InvoiceWithHistory = {
    invoice: {
      id: 'inv-to-approve-1',
      invoice_number: 'INV-APP-001',
      supplier_id: 'supp-uuid-1',
      buyer_id: 'buyer-uuid-1',
      amount_cents: '5000000', // ₹50,000.00
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'SUBMITTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    events: [
      {
        id: 'ev-1',
        invoice_id: 'inv-to-approve-1',
        event_type: 'invoice.submitted',
        payload: {},
        actor_id: 'supp-uuid-1',
        occurred_at: new Date().toISOString(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockInvoiceData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders invoice summary details on approval page', async () => {
    render(
      <MemoryRouter initialEntries={['/buyer/invoices/inv-to-approve-1/approve']}>
        <Routes>
          <Route path="/buyer/invoices/:id/approve" element={<ApproveInvoicePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Review Invoice INV-APP-001')).toBeDefined();
    expect(screen.getByText('₹50,000.00')).toBeDefined();
    expect(screen.getByText('Commercial Liability Acknowledgement')).toBeDefined();
  });

  it('disables approval submission when signature length is less than 10 characters', async () => {
    render(
      <MemoryRouter initialEntries={['/buyer/invoices/inv-to-approve-1/approve']}>
        <Routes>
          <Route path="/buyer/invoices/:id/approve" element={<ApproveInvoicePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Review Invoice INV-APP-001');

    const checkbox = screen.getByLabelText(/I confirm the goods\/services are received/i);
    fireEvent.click(checkbox);

    const signatureInput = screen.getByLabelText(/Digital Approval Signature/i);
    fireEvent.change(signatureInput, { target: { value: 'short' } }); // 5 chars

    const submitBtn = screen.getByRole('button', { name: /Approve Invoice/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Minimum 10 characters required/i)).toBeDefined();
  });

  it('enables approval submission when signature has 10 or more characters and legal notice is acknowledged', async () => {
    render(
      <MemoryRouter initialEntries={['/buyer/invoices/inv-to-approve-1/approve']}>
        <Routes>
          <Route path="/buyer/invoices/:id/approve" element={<ApproveInvoicePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Review Invoice INV-APP-001');

    const checkbox = screen.getByLabelText(/I confirm the goods\/services are received/i);
    fireEvent.click(checkbox);

    const signatureInput = screen.getByLabelText(/Digital Approval Signature/i);
    fireEvent.change(signatureInput, { target: { value: 'valid-sig-12345' } }); // 15 chars

    const submitBtn = screen.getByRole('button', { name: /Approve Invoice/i });
    expect(submitBtn).not.toBeDisabled();
    expect(screen.getByText(/Cryptographic signature format valid/i)).toBeDefined();
  });

  it('submits approval via POST /invoices/:id/approve with signature and navigates to /buyer on success', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ...mockInvoiceData.invoice,
      status: 'BUYER_APPROVED',
    });

    render(
      <MemoryRouter initialEntries={['/buyer/invoices/inv-to-approve-1/approve']}>
        <Routes>
          <Route path="/buyer/invoices/:id/approve" element={<ApproveInvoicePage />} />
          <Route path="/buyer" element={<div>Buyer Dashboard Target</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Review Invoice INV-APP-001');

    const checkbox = screen.getByLabelText(/I confirm the goods\/services are received/i);
    fireEvent.click(checkbox);

    const signatureInput = screen.getByLabelText(/Digital Approval Signature/i);
    fireEvent.change(signatureInput, { target: { value: 'sha256-omega-approval-sig-m5' } });

    const submitBtn = screen.getByRole('button', { name: /Approve Invoice/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/invoices/inv-to-approve-1/approve', {
        buyer_signature: 'sha256-omega-approval-sig-m5',
      });
    });

    expect(await screen.findByText('Buyer Dashboard Target')).toBeDefined();
  });

  it('handles 409 INVALID_TRANSITION conflict by displaying status change alert and refreshing', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiClientError(
        'INVALID_TRANSITION',
        'Invoice cannot transition from CURRENT_STATUS to BUYER_APPROVED',
        409
      )
    );

    render(
      <MemoryRouter initialEntries={['/buyer/invoices/inv-to-approve-1/approve']}>
        <Routes>
          <Route path="/buyer/invoices/:id/approve" element={<ApproveInvoicePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Review Invoice INV-APP-001');

    const checkbox = screen.getByLabelText(/I confirm the goods\/services are received/i);
    fireEvent.click(checkbox);

    const signatureInput = screen.getByLabelText(/Digital Approval Signature/i);
    fireEvent.change(signatureInput, { target: { value: 'sha256-omega-approval-sig-m5' } });

    const submitBtn = screen.getByRole('button', { name: /Approve Invoice/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/The invoice status was modified and is no longer awaiting approval/i)
    ).toBeDefined();

    // Verify invoice data was re-fetched
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('shows loading spinner and disables button during approval API call', async () => {
    let resolvePost: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    vi.spyOn(apiClient, 'post').mockReturnValue(pendingPromise);

    render(
      <MemoryRouter initialEntries={['/buyer/invoices/inv-to-approve-1/approve']}>
        <Routes>
          <Route path="/buyer/invoices/:id/approve" element={<ApproveInvoicePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Review Invoice INV-APP-001');

    fireEvent.click(screen.getByLabelText(/I confirm the goods\/services are received/i));
    fireEvent.change(screen.getByLabelText(/Digital Approval Signature/i), {
      target: { value: 'sha256-omega-approval-sig-m5' },
    });

    const submitBtn = screen.getByRole('button', { name: /Approve Invoice/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Submitting Approval/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Submitting Approval/i })).toBeDisabled();

    // Cleanup pending promise
    resolvePost!({ ...mockInvoiceData.invoice, status: 'BUYER_APPROVED' });
  });
});
