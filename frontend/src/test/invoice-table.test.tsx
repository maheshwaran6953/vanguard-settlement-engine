import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvoiceTable } from '../components/invoices/InvoiceTable';
import { StatusBadge } from '../components/invoices/StatusBadge';
import { Invoice, InvoiceStatus } from '../api/types';

describe('InvoiceTable and StatusBadge', () => {
  const sampleInvoices: Invoice[] = [
    {
      id: 'inv-1',
      invoice_number: 'INV-101',
      supplier_id: 's1',
      buyer_id: 'b1',
      amount_cents: '1000000',
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'SUBMITTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it('triggers onStatusChange when status filter is selected', () => {
    const handleStatusChange = vi.fn();

    render(
      <InvoiceTable
        invoices={sampleInvoices}
        selectedStatus=""
        onStatusChange={handleStatusChange}
        limit={20}
        offset={0}
        onPageChange={vi.fn()}
      />
    );

    const select = screen.getByLabelText(/filter:/i);
    fireEvent.change(select, { target: { value: 'SUBMITTED' } });

    expect(handleStatusChange).toHaveBeenCalledWith('SUBMITTED');
  });

  it('triggers onPageChange with updated offset on pagination click', () => {
    const handlePageChange = vi.fn();

    // 20 items to enable Next button
    const twentyInvoices: Invoice[] = Array.from({ length: 20 }, (_, i) => ({
      ...sampleInvoices[0],
      id: `inv-${i}`,
      invoice_number: `INV-${100 + i}`,
    }));

    render(
      <InvoiceTable
        invoices={twentyInvoices}
        selectedStatus=""
        onStatusChange={vi.fn()}
        limit={20}
        offset={0}
        onPageChange={handlePageChange}
      />
    );

    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    expect(handlePageChange).toHaveBeenCalledWith(20);
  });

  it('renders all 8 valid statuses correctly via StatusBadge', () => {
    const statuses: InvoiceStatus[] = [
      'DRAFT',
      'SUBMITTED',
      'BUYER_APPROVED',
      'FINANCING_REQUESTED',
      'FUNDED',
      'REPAID',
      'DEFAULTED',
      'CANCELLED',
    ];

    const { rerender } = render(<StatusBadge status="DRAFT" />);

    for (const status of statuses) {
      rerender(<StatusBadge status={status} />);
      const badge = screen.getByTestId(`status-badge-${status.toLowerCase()}`);
      expect(badge).toBeDefined();
    }
  });
});
