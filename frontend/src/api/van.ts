import { apiClient } from './client';
import { VanWithLedger } from './types';

export async function getVanByInvoice(invoiceId: string): Promise<VanWithLedger> {
  return apiClient.get<VanWithLedger>(`/vans/${invoiceId}`);
}
