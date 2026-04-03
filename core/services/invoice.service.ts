import { pool }              from '../database/pool';
import { IInvoiceRepository} from '../repositories/invoice.repository';
import { IEventRepository }  from '../repositories/event.repository';
import {
  SubmitInvoiceCommand,
  ApproveInvoiceCommand,
  RequestFinancingCommand,
  InvoiceWithHistory,
} from './invoice.service.types';
import { Invoice }           from '../domain/entities';

// ------------------------------------------------------------------
// Custom error types — callers can distinguish business rule
// violations from unexpected system errors.
// ------------------------------------------------------------------
export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice not found: ${id}`);
    this.name = 'InvoiceNotFoundError';
  }
}

export class UnauthorisedActorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorisedActorError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

// ------------------------------------------------------------------
// Valid state machine transitions.
// This is the enforcement layer for your invoice_status enum.
// If a transition isn't listed here, the service rejects it.
// ------------------------------------------------------------------
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:                ['SUBMITTED', 'CANCELLED'],
  SUBMITTED:            ['BUYER_APPROVED', 'CANCELLED'],
  BUYER_APPROVED:       ['FINANCING_REQUESTED', 'CANCELLED'],
  FINANCING_REQUESTED:  ['FUNDED', 'CANCELLED'],
  FUNDED:               ['REPAID', 'DEFAULTED'],
  REPAID:               [],   // terminal state
  DEFAULTED:            [],   // terminal state
  CANCELLED:            [],   // terminal state
};

function assertValidTransition(
  current: string,
  next: string
): void {
  const allowed = VALID_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new InvalidTransitionError(current, next);
  }
}

// ------------------------------------------------------------------
// InvoiceService
// ------------------------------------------------------------------
export class InvoiceService {
  constructor(
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly eventRepo:   IEventRepository,
  ) {}

  // ----------------------------------------------------------------
  // submitInvoice
  // Business rules:
  //   1. invoice_number must be unique (DB UNIQUE constraint is the
  //      final guard, but we check first for a clean error message)
  //   2. buyer and supplier must be different organisations
  //      (DB CHECK constraint is the final guard)
  //   3. amount must be positive
  //   4. due_date must be in the future
  // On success: invoice is created in DRAFT status, then immediately
  // transitioned to SUBMITTED within a single DB transaction.
  // ----------------------------------------------------------------
  async submitInvoice(
    cmd: SubmitInvoiceCommand,
    actorId: string
  ): Promise<Invoice> {

    // --- Business rule validations ---
    if (cmd.amount_cents <= 0) {
      throw new Error('Invoice amount must be positive');
    }

    if (cmd.due_date <= new Date()) {
      throw new Error('Due date must be in the future');
    }

    const existing = await this.invoiceRepo.findByInvoiceNumber(
      cmd.invoice_number
    );
    if (existing) {
      throw new Error(
        `Invoice number ${cmd.invoice_number} already exists`
      );
    }

    // --- Transactional write ---
    // Both the INSERT and the status UPDATE must succeed or both
    // must roll back. We use a pool client directly here to get
    // explicit transaction control.
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Create in DRAFT
      const invoice = await this.invoiceRepo.save({
        invoice_number: cmd.invoice_number,
        supplier_id:    cmd.supplier_id,
        buyer_id:       cmd.buyer_id,
        amount_cents:   cmd.amount_cents,
        currency:       cmd.currency,
        due_date:       cmd.due_date,
      });

      // 2. Transition DRAFT → SUBMITTED within same transaction
      assertValidTransition('DRAFT', 'SUBMITTED');
      const submitted = await this.invoiceRepo.updateStatus(
        invoice.id,
        'SUBMITTED',
        client
      );

      // 3. Append event to the audit log within same transaction
      await this.eventRepo.append(
        {
          invoice_id:  invoice.id,
          event_type:  'invoice.submitted',
          payload:     {
            invoice_number: invoice.invoice_number,
            amount_cents:   invoice.amount_cents,
            buyer_id:       invoice.buyer_id,
            supplier_id:    invoice.supplier_id,
          },
          actor_id: actorId,
        },
        client
      );

      await client.query('COMMIT');
      return submitted;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      // Always release — even if COMMIT itself throws
      client.release();
    }
  }

  // ----------------------------------------------------------------
  // approveInvoice
  // Business rules:
  //   1. Invoice must exist
  //   2. The caller must be the designated buyer on the invoice
  //      (prevents a supplier approving their own invoice)
  //   3. Invoice must be in SUBMITTED status
  //   4. buyer_signature must be provided (cryptographic proof)
  // ----------------------------------------------------------------
  async approveInvoice(
    cmd: ApproveInvoiceCommand,
    actorId: string
  ): Promise<Invoice> {

    const invoice = await this.invoiceRepo.findById(cmd.invoice_id);
    if (!invoice) {
      throw new InvoiceNotFoundError(cmd.invoice_id);
    }

    // Security check — the actor must be the buyer on this invoice
    if (invoice.buyer_id !== cmd.buyer_id) {
      throw new UnauthorisedActorError(
        'Only the designated buyer can approve this invoice'
      );
    }

    assertValidTransition(invoice.status, 'BUYER_APPROVED');

    if (!cmd.buyer_signature || cmd.buyer_signature.length < 10) {
      throw new Error('A valid buyer signature is required for approval');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Attach the buyer's signature to the invoice record
      await client.query(
        `UPDATE invoices
         SET buyer_signature = $1, updated_at = now()
         WHERE id = $2`,
        [cmd.buyer_signature, invoice.id]
      );

      const approved = await this.invoiceRepo.updateStatus(
        invoice.id,
        'BUYER_APPROVED',
        client
      );

      await this.eventRepo.append(
        {
          invoice_id: invoice.id,
          event_type: 'invoice.buyer_approved',
          payload:    {
            buyer_id:        cmd.buyer_id,
            buyer_signature: cmd.buyer_signature,
            approved_at:     new Date().toISOString(),
          },
          actor_id: actorId,
        },
        client
      );

      await client.query('COMMIT');
      return approved;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ----------------------------------------------------------------
  // requestFinancing
  // Business rules:
  //   1. Invoice must exist and belong to this supplier
  //   2. Invoice must be BUYER_APPROVED — the buyer's digital
  //      signature is our collateral. We never fund an unapproved
  //      invoice. This is the core fraud-prevention gate.
  //   3. Transitions to FINANCING_REQUESTED (the AI Risk Engine
  //      in Step 6 will evaluate and move it to FUNDED or back)
  // ----------------------------------------------------------------
  async requestFinancing(
    cmd: RequestFinancingCommand,
    actorId: string
  ): Promise<Invoice> {

    const invoice = await this.invoiceRepo.findById(cmd.invoice_id);
    if (!invoice) {
      throw new InvoiceNotFoundError(cmd.invoice_id);
    }

    if (invoice.supplier_id !== cmd.supplier_id) {
      throw new UnauthorisedActorError(
        'Only the invoice supplier can request financing'
      );
    }

    assertValidTransition(invoice.status, 'FINANCING_REQUESTED');

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const updated = await this.invoiceRepo.updateStatus(
        invoice.id,
        'FINANCING_REQUESTED',
        client
      );

      await this.eventRepo.append(
        {
          invoice_id: invoice.id,
          event_type: 'invoice.financing_requested',
          payload:    {
            supplier_id:  cmd.supplier_id,
            amount_cents: invoice.amount_cents,
            requested_at: new Date().toISOString(),
          },
          actor_id: actorId,
        },
        client
      );

      await client.query('COMMIT');
      return updated;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ----------------------------------------------------------------
  // getInvoiceHistory
  // Read-only. Returns the invoice with its full audit trail.
  // No transaction needed — reads are non-destructive.
  // ----------------------------------------------------------------
  async getInvoiceHistory(invoiceId: string): Promise<InvoiceWithHistory> {
    const [invoice, events] = await Promise.all([
      this.invoiceRepo.findById(invoiceId),
      this.eventRepo.findByInvoiceId(invoiceId),
    ]);

    if (!invoice) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    return { invoice, events };
  }
}