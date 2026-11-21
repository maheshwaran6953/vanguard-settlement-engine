import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubmitInvoicePage } from '../pages/supplier/SubmitInvoicePage';
import { apiClient } from '../api/client';
import { ApiClientError } from '../api/errors';

describe('SubmitInvoicePage', () => {
  const mockBuyers = [
    { id: 'b0000000-0000-0000-0000-000000000001', legal_name: 'Omega Retailers Pvt Ltd' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockBuyers);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates buyer dropdown from GET /organisations?role=buyer', async () => {
    render(
      <MemoryRouter>
        <SubmitInvoicePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Omega Retailers Pvt Ltd')).toBeDefined();
    });

    expect(apiClient.get).toHaveBeenCalledWith('/organisations?role=buyer');
  });

  it('converts rupees to paise without floating-point error on submit', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      id: 'inv-new',
      invoice_number: 'INV-M4-001',
      supplier_id: 's1',
      buyer_id: 'b0000000-0000-0000-0000-000000000001',
      amount_cents: 1000050,
      currency: 'INR',
      due_date: '2026-12-31',
      status: 'SUBMITTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    render(
      <MemoryRouter>
        <SubmitInvoicePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Omega Retailers Pvt Ltd')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/invoice number/i), {
      target: { value: 'INV-M4-001' },
    });
    fireEvent.change(screen.getByLabelText(/buyer organisation/i), {
      target: { value: 'b0000000-0000-0000-0000-000000000001' },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: '10000.50' },
    });
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: '2026-12-31' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit invoice/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    const [endpoint, payload, options] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/invoices');
    expect(payload).toEqual({
      invoice_number: 'INV-M4-001',
      buyer_id: 'b0000000-0000-0000-0000-000000000001',
      amount_cents: 1000050, // 10000.50 rupees strictly equals 1000050 paise
      currency: 'INR',
      due_date: '2026-12-31',
    });

    // Verify Idempotency-Key header was attached
    const idempotencyKey = (options?.headers as Record<string, string>)?.['Idempotency-Key'];
    expect(idempotencyKey).toBeDefined();
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeGreaterThan(10);

    // Verify key was NEVER persisted to localStorage
    expect(localStorage.getItem('idempotencyKey')).toBeNull();
    expect(localStorage.getItem('Idempotency-Key')).toBeNull();
  });

  it('rejects input with > 2 decimal places before submitting', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');

    render(
      <MemoryRouter>
        <SubmitInvoicePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Omega Retailers Pvt Ltd')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/invoice number/i), {
      target: { value: 'INV-DECIMAL-ERR' },
    });
    fireEvent.change(screen.getByLabelText(/buyer organisation/i), {
      target: { value: 'b0000000-0000-0000-0000-000000000001' },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: '10000.505' },
    });
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: '2026-12-31' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit invoice/i }));

    await waitFor(() => {
      expect(screen.getByText(/maximum 2 decimal places allowed/i)).toBeDefined();
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('reuses the identical Idempotency-Key on retry after failure', async () => {
    let capturedKeys: string[] = [];

    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation((_url, _body, options) => {
      const key = (options?.headers as Record<string, string>)?.['Idempotency-Key'];
      capturedKeys.push(key);
      return Promise.reject(new ApiClientError('NETWORK_ERROR', 'Simulated network drop', 0));
    });

    render(
      <MemoryRouter>
        <SubmitInvoicePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Omega Retailers Pvt Ltd')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/invoice number/i), {
      target: { value: 'INV-RETRY-01' },
    });
    fireEvent.change(screen.getByLabelText(/buyer organisation/i), {
      target: { value: 'b0000000-0000-0000-0000-000000000001' },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: '5000' },
    });
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: '2026-12-31' },
    });

    // First submit attempt
    fireEvent.click(screen.getByRole('button', { name: /submit invoice/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Simulated network drop')).toBeDefined();

    // Second submit attempt (retry)
    fireEvent.click(screen.getByRole('button', { name: /submit invoice/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledTimes(2);
    });

    // Assert that the exact same key was sent on both attempts
    expect(capturedKeys.length).toBe(2);
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
  });
});
