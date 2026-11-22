import { Pool, PoolClient } from 'pg';
import { Invoice, CreateInvoiceInput, InvoiceStatus } from '../domain/entities';
import { InvalidTransitionError } from '../services/invoice/state-machine';

export interface FindInvoicesFilter {
  supplierId?: string;
  buyerId?: string;
  status?: InvoiceStatus;
  limit?: number;
  offset?: number;
}

export interface IInvoiceRepository {
findById(id: string):                        Promise<Invoice | null>;
findByIdForUpdate(id: string, client: PoolClient): Promise<Invoice | null>;
findByInvoiceNumber(number: string):         Promise<Invoice | null>;
findBySupplierId(supplierId: string):        Promise<Invoice[]>;
findAll(filter: FindInvoicesFilter):         Promise<Invoice[]>;
save(input: CreateInvoiceInput):             Promise<Invoice>;
updateStatus(
    id: string,
    status: InvoiceStatus,
    client?: PoolClient,              // accepts a transaction client
    expectedStatus?: InvoiceStatus   // conditional update guard
): Promise<Invoice>;
}

export class InvoiceRepository implements IInvoiceRepository {
constructor(private readonly pool: Pool) {}

// ---------------------------------------------------------
// findById
// Returns null instead of throwing when not found.
// The caller decides what "not found" means — not the repo.
// ---------------------------------------------------------
async findById(id: string): Promise<Invoice | null> {
    const result = await this.pool.query<Invoice>(
    `SELECT * FROM invoices WHERE id = $1 LIMIT 1`,
    [id]
    );
    return result.rows[0] ?? null;
}

// ---------------------------------------------------------
// findByIdForUpdate
// Locks the row within the transaction using SELECT ... FOR UPDATE.
// Returns null if not found.
// ---------------------------------------------------------
async findByIdForUpdate(id: string, client: PoolClient): Promise<Invoice | null> {
    const result = await client.query<Invoice>(
    `SELECT * FROM invoices WHERE id = $1 FOR UPDATE LIMIT 1`,
    [id]
    );
    return result.rows[0] ?? null;
}

// ---------------------------------------------------------
// findByInvoiceNumber
// Used during Three-Way Matching to locate the invoice
// referenced in a PO or delivery receipt.
// ---------------------------------------------------------
async findByInvoiceNumber(number: string): Promise<Invoice | null> {
    const result = await this.pool.query<Invoice>(
    `SELECT * FROM invoices WHERE invoice_number = $1 LIMIT 1`,
    [number]
    );
    return result.rows[0] ?? null;
}

// ---------------------------------------------------------
// findBySupplierId
// Used by the supplier dashboard to list their invoices.
// Ordered by due_date ascending — most urgent first.
// ---------------------------------------------------------
async findBySupplierId(supplierId: string): Promise<Invoice[]> {
    const result = await this.pool.query<Invoice>(
    `SELECT * FROM invoices
    WHERE supplier_id = $1
    ORDER BY due_date ASC`,
    [supplierId]
    );
    return result.rows;
}

// ---------------------------------------------------------
// save
// Inserts a new invoice. Returns the full persisted row.
// RETURNING * avoids a second round-trip to fetch the row.
// ---------------------------------------------------------
async save(input: CreateInvoiceInput): Promise<Invoice> {
    const result = await this.pool.query<Invoice>(
    `INSERT INTO invoices (
        invoice_number, supplier_id, buyer_id,
        amount_cents, currency, due_date
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
        input.invoice_number,
        input.supplier_id,
        input.buyer_id,
        input.amount_cents,
        input.currency,
        input.due_date,
    ]
    );
    // result.rows[0] is guaranteed here because INSERT always
    // returns the created row. The non-null assertion is safe.
    return result.rows[0]!;
}

// ---------------------------------------------------------
// updateStatus
// Accepts an optional PoolClient for transactional use.
// When expectedStatus is passed, makes the status update conditional:
// UPDATE invoices SET status = $new WHERE id = $id AND status = $expected.
// If zero rows are updated, throws InvalidTransitionError (409).
// ---------------------------------------------------------
async updateStatus(
    id: string,
    status: InvoiceStatus,
    client?: PoolClient,
    expectedStatus?: InvoiceStatus
): Promise<Invoice> {
    const runner = client ?? this.pool;
    let query: string;
    let params: unknown[];

    if (expectedStatus) {
      query = `UPDATE invoices
               SET status = $1, updated_at = now()
               WHERE id = $2 AND status = $3
               RETURNING *`;
      params = [status, id, expectedStatus];
    } else {
      query = `UPDATE invoices
               SET status = $1, updated_at = now()
               WHERE id = $2
               RETURNING *`;
      params = [status, id];
    }

    const result = await runner.query<Invoice>(query, params);
    if (!result.rows[0]) {
      if (expectedStatus) {
        const currentRes = await runner.query<{ status: InvoiceStatus }>(
          `SELECT status FROM invoices WHERE id = $1`,
          [id]
        );
        const currentStatus = currentRes.rows[0]?.status ?? expectedStatus;
        throw new InvalidTransitionError(currentStatus, status);
      }
      throw new Error(`Invoice ${id} not found during status update`);
    }
    return result.rows[0]!;
}

// ---------------------------------------------------------
// findAll
// Role-scoped query supporting status filter and pagination.
// ---------------------------------------------------------
async findAll(filter: FindInvoicesFilter): Promise<Invoice[]> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (filter.supplierId) {
        conditions.push(`supplier_id = $${paramIndex++}`);
        values.push(filter.supplierId);
    }

    if (filter.buyerId) {
        conditions.push(`buyer_id = $${paramIndex++}`);
        values.push(filter.buyerId);
    }

    if (filter.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;

    values.push(limit);
    const limitParam = `$${paramIndex++}`;

    values.push(offset);
    const offsetParam = `$${paramIndex++}`;

    const query = `
        SELECT * FROM invoices
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const result = await this.pool.query<Invoice>(query, values);
    return result.rows;
}
}