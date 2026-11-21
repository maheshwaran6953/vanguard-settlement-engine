import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvoiceTable } from '../components/invoices/InvoiceTable';
import { Invoice } from '../api/types';

describe('Request Financing Action', () => {
  const approvedInvoice: Invoice = {
    id: 'inv-approved-1',
    invoice_number: 'INV-APP-001',
    supplier_id: 's1',
    buyer_id: 'b1',
    amount_cents: '5000000',
    currency: 'INR',
    due_date: '2026-12-31',
    status: 'BUYER_APPROVED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const submittedInvoice: Invoice = {
    id: 'inv-submitted-2',
    invoice_number: 'INV-SUB-002',
    supplier_id: 's1',
    buyer_id: 'b1',
    amount_cents: '2500000',
    currency: 'INR',
    due_date: '2026-12-31',
    status: 'SUBMITTED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders "Request Financing" button only on BUYER_APPROVED rows', () => {
    render(
      <InvoiceTable
        invoices={[approvedInvoice, submittedInvoice]}
        selectedStatus=""
        onStatusChange={vi.fn()}
        limit={20}
        offset={0}
        onPageChange={vi.fn()}
      />
    );

    // One button for approved invoice
    const buttons = screen.getAllByRole('button', { name: /request financing/i });
    expect(buttons.length).toBe(1);

    // Other row shows dash
    expect(screen.getByText('—')).toBeDefined();
  });

  it('disables the button while financing request is in flight', () => {
    const handleRequest = vi.fn().mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <InvoiceTable
        invoices={[approvedInvoice]}
        selectedStatus=""
        onStatusChange={vi.fn()}
        limit={20}
        offset={0}
        onPageChange={vi.fn()}
        onRequestFinancing={handleRequest}
        pendingFinancingId={null}
      />
    );

    const button = screen.getByRole('button', { name: /request financing/i });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(handleRequest).toHaveBeenCalledWith('inv-approved-1');

    // Simulate in-flight pending state
    rerender(
      <InvoiceTable
        invoices={[approvedInvoice]}
        selectedStatus=""
        onStatusChange={vi.fn()}
        limit={20}
        offset={0}
        onPageChange={vi.fn()}
        onRequestFinancing={handleRequest}
        pendingFinancingId="inv-approved-1"
      />
    );

    const disabledButton = screen.getByRole('button', { name: /requesting\.\.\./i });
    expect(disabledButton).toBeDisabled();
  });
});
