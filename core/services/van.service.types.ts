import { VirtualAccount, LedgerEntry } from '../domain/entities';

export interface CreateVanCommand {
  invoice_id:            string;
  expected_amount_cents: number;
}

// Simulates a bank webhook payload arriving when the buyer pays.
// In production this comes from your payment rails provider
// (e.g. Razorpay, YES Bank VAN API).
export interface RecordPaymentCommand {
  account_number:  string;
  amount_cents:    number;
  idempotency_key: string;   // bank's unique transaction reference
  paid_at:         Date;
}

export interface VanWithLedger {
  virtual_account: VirtualAccount;
  ledger_entries:  LedgerEntry[];
  is_fully_settled: boolean;
}