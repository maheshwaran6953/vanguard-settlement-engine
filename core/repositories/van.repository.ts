import { Pool, PoolClient }  from 'pg';
import { VirtualAccount, LedgerEntry } from '../domain/entities';

export interface CreateVanInput {
  invoice_id:            string;
  account_number:        string;
  ifsc_code:             string;
  expected_amount_cents: number;
  expires_at:            Date;
}

export interface CreateLedgerEntryInput {
  virtual_account_id: string;
  entry_type:         'debit' | 'credit';
  amount_cents:       number;
  description:        string;
  idempotency_key:    string;
}

export interface IVanRepository {
  create(input: CreateVanInput, client?: PoolClient): Promise<VirtualAccount>;
  findByInvoiceId(invoiceId: string):                 Promise<VirtualAccount | null>;
  findByAccountNumber(accountNumber: string):         Promise<VirtualAccount | null>;
  updateReceivedAmount(
    id: string,
    additionalAmountCents: number,
    client?: PoolClient
  ): Promise<VirtualAccount>;
  settleAccount(id: string, client?: PoolClient):     Promise<VirtualAccount>;
  appendLedgerEntry(
    input: CreateLedgerEntryInput,
    client?: PoolClient
  ): Promise<LedgerEntry>;
  getLedgerEntries(virtualAccountId: string):         Promise<LedgerEntry[]>;
}

export class VanRepository implements IVanRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    input: CreateVanInput,
    client?: PoolClient
  ): Promise<VirtualAccount> {
    const runner = client ?? this.pool;
    const result = await runner.query<VirtualAccount>(
      `INSERT INTO virtual_accounts (
         invoice_id, account_number, ifsc_code,
         expected_amount_cents, expires_at
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.invoice_id,
        input.account_number,
        input.ifsc_code,
        input.expected_amount_cents,
        input.expires_at,
      ]
    );
    return result.rows[0]!;
  }

  async findByInvoiceId(invoiceId: string): Promise<VirtualAccount | null> {
    const result = await this.pool.query<VirtualAccount>(
      `SELECT * FROM virtual_accounts WHERE invoice_id = $1 LIMIT 1`,
      [invoiceId]
    );
    return result.rows[0] ?? null;
  }

  async findByAccountNumber(
    accountNumber: string
  ): Promise<VirtualAccount | null> {
    const result = await this.pool.query<VirtualAccount>(
      `SELECT * FROM virtual_accounts
       WHERE account_number = $1 LIMIT 1`,
      [accountNumber]
    );
    return result.rows[0] ?? null;
  }

  // Uses a SQL-level increment to avoid a read-modify-write race condition.
  // If two webhook events arrive simultaneously, both increment atomically.
  // A SELECT then UPDATE pattern would lose one of them.
  async updateReceivedAmount(
    id: string,
    additionalAmountCents: number,
    client?: PoolClient
  ): Promise<VirtualAccount> {
    const runner = client ?? this.pool;
    const result = await runner.query<VirtualAccount>(
      `UPDATE virtual_accounts
       SET received_amount_cents = received_amount_cents + $1
       WHERE id = $2
       RETURNING *`,
      [additionalAmountCents, id]
    );
    if (!result.rows[0]) {
      throw new Error(`VirtualAccount ${id} not found`);
    }
    return result.rows[0]!;
  }

  async settleAccount(
    id: string,
    client?: PoolClient
  ): Promise<VirtualAccount> {
    const runner = client ?? this.pool;
    const result = await runner.query<VirtualAccount>(
      `UPDATE virtual_accounts
       SET status = 'settled'
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (!result.rows[0]) {
      throw new Error(`VirtualAccount ${id} not found`);
    }
    return result.rows[0]!;
  }

  // The UNIQUE constraint on idempotency_key is the DB-level guard.
  // This method will throw a constraint error on duplicate keys —
  // the service layer catches that specific error and treats it as
  // "already processed" rather than a system failure.
  async appendLedgerEntry(
    input: CreateLedgerEntryInput,
    client?: PoolClient
  ): Promise<LedgerEntry> {
    const runner = client ?? this.pool;
    const result = await runner.query<LedgerEntry>(
      `INSERT INTO ledger_entries (
         virtual_account_id, entry_type,
         amount_cents, description, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.virtual_account_id,
        input.entry_type,
        input.amount_cents,
        input.description,
        input.idempotency_key,
      ]
    );
    return result.rows[0]!;
  }

  async getLedgerEntries(virtualAccountId: string): Promise<LedgerEntry[]> {
    const result = await this.pool.query<LedgerEntry>(
      `SELECT * FROM ledger_entries
       WHERE virtual_account_id = $1
       ORDER BY created_at ASC`,
      [virtualAccountId]
    );
    return result.rows;
  }
}