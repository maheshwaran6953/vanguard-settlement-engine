import { Pool, PoolClient } from 'pg';
import { Invoice, CreateInvoiceInput, InvoiceStatus } from '../domain/entities';

export interface IInvoiceRepository {
findById(id: string):                        Promise<Invoice | null>;
findByInvoiceNumber(number: string):         Promise<Invoice | null>;
findBySupplierId(supplierId: string):        Promise<Invoice[]>;
save(input: CreateInvoiceInput):             Promise<Invoice>;
updateStatus(
    id: string,
    status: InvoiceStatus,
    client?: PoolClient              // accepts a transaction client
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
// When the Saga pattern runs in Step 5, every status update
// must participate in the same DB transaction. This optional
// client parameter is how we enable that without changing
// the interface.
// ---------------------------------------------------------
async updateStatus(
    id: string,
    status: InvoiceStatus,
    client?: PoolClient
): Promise<Invoice> {
    const runner = client ?? this.pool;
    const result = await runner.query<Invoice>(
    `UPDATE invoices
    SET status = $1, updated_at = now()
    WHERE id = $2
    RETURNING *`,
    [status, id]
    );
    if (!result.rows[0]) {
    throw new Error(`Invoice ${id} not found during status update`);
    }
    return result.rows[0]!;
}
}