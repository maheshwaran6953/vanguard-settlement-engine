import { apiClient } from './client';
import { InvoiceWithHistory, ApproveInvoiceInput, Invoice } from './types';

export async function getInvoiceDetail(id: string): Promise<InvoiceWithHistory> {
  return apiClient.get<InvoiceWithHistory>(`/invoices/${id}`);
}

export async function approveInvoice(id: string, input: ApproveInvoiceInput): Promise<Invoice> {
  return apiClient.post<Invoice>(`/invoices/${id}/approve`, input);
}
