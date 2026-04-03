import { Pool, PoolClient } from 'pg';
import { InvoiceEvent } from '../domain/entities';

export interface CreateEventInput {
invoice_id:  string;
event_type:  string;
payload:     Record<string, unknown>;
actor_id?:   string;
}

export interface IEventRepository {
append(input: CreateEventInput, client?: PoolClient): Promise<InvoiceEvent>;
findByInvoiceId(invoiceId: string):                   Promise<InvoiceEvent[]>;
}

export class EventRepository implements IEventRepository {

constructor(private readonly pool: Pool) {}

// ---------------------------------------------------------
// append
// This is the ONLY write method on this repository.
// There is no update(), no delete(). Append-only by design.
// The optional PoolClient allows this to run inside the same
// transaction as an updateStatus() call — critical for
// keeping the invoices table and event store in sync.
// ---------------------------------------------------------
async append(
    input: CreateEventInput,
    client?: PoolClient
): Promise<InvoiceEvent> {
    const runner = client ?? this.pool;
    const result = await runner.query<InvoiceEvent>(
    `INSERT INTO invoice_events (invoice_id, event_type, payload, actor_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
        input.invoice_id,
        input.event_type,
        JSON.stringify(input.payload),
        input.actor_id ?? null,
    ]
    );
    return result.rows[0]!;
}

// ---------------------------------------------------------
// findByInvoiceId
// Returns the complete event history for an invoice,
// oldest first. This IS the audit trail.
// ---------------------------------------------------------
async findByInvoiceId(invoiceId: string): Promise<InvoiceEvent[]> {
    const result = await this.pool.query<InvoiceEvent>(
    `SELECT * FROM invoice_events
    WHERE invoice_id = $1
    ORDER BY occurred_at ASC`,
    [invoiceId]
    );
    return result.rows;
}
}