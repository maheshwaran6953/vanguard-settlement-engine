import { Queue }               from 'bullmq';
import { pool }               from '../database/pool';
import { IVanRepository }     from '../repositories/van.repository';
import { IInvoiceRepository } from '../repositories/invoice.repository';
import { IEventRepository }   from '../repositories/event.repository';
import {
CreateVanCommand,
RecordPaymentCommand,
VanWithLedger,
} from './van.service.types';
import { VirtualAccount }     from '../domain/entities';
import { createLogger }       from '../utils/logger';
import { JOB_TYPES }           from '../../infra/queue/registry';
import { SettlementReceiptPdfPayload } from '../../infra/queue/job-payloads';

const log = createLogger('VanService');

// PostgreSQL unique violation error code
const PG_UNIQUE_VIOLATION = '23505';

export class DuplicatePaymentError extends Error {
constructor(idempotencyKey: string) {
    super(`Payment ${idempotencyKey} already processed`);
    this.name = 'DuplicatePaymentError';
}
}

export class VanNotFoundError extends Error {
constructor(identifier: string) {
    super(`Virtual account not found: ${identifier}`);
    this.name = 'VanNotFoundError';
}
}

export class VanAlreadyExistsError extends Error {
constructor(invoiceId: string) {
    super(`Virtual account already exists for invoice: ${invoiceId}`);
    this.name = 'VanAlreadyExistsError';
}
}


export class VanService {
    constructor(
        private readonly vanRepo:      IVanRepository,
        private readonly invoiceRepo:  IInvoiceRepository,
        private readonly eventRepo:    IEventRepository,
        private readonly documentQueue: Queue,
    ) {}

// ----------------------------------------------------------------
// createVan
// Called immediately after an invoice reaches FINANCING_REQUESTED.
//
// Business rules:
//   1. Invoice must exist and be in FINANCING_REQUESTED status
//   2. No VAN may already exist for this invoice (1-to-1)
//   3. VAN expires after 90 days — standard invoice payment term
// ----------------------------------------------------------------
async createVan(cmd: CreateVanCommand): Promise<VirtualAccount> {
    log.info({ invoice_id: cmd.invoice_id }, 'Creating VAN for invoice');

    const invoice = await this.invoiceRepo.findById(cmd.invoice_id);
    if (!invoice) {
    throw new Error(`Invoice not found: ${cmd.invoice_id}`);
    }

    if (invoice.status !== 'FINANCING_REQUESTED') {
    throw new Error(
        `Cannot create VAN for invoice in status: ${invoice.status}. ` +
        `Invoice must be in FINANCING_REQUESTED status.`
    );
    }

    const existing = await this.vanRepo.findByInvoiceId(cmd.invoice_id);
    if (existing) {
    throw new VanAlreadyExistsError(cmd.invoice_id);
    }

    const accountNumber = this.generateAccountNumber();
    const ifscCode      = 'YESB0CMSNOC';

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const client = await pool.connect();

    try {
    await client.query('BEGIN');

    const van = await this.vanRepo.create(
        {
        invoice_id:            cmd.invoice_id,
        account_number:        accountNumber,
        ifsc_code:             ifscCode,
        expected_amount_cents: cmd.expected_amount_cents,
        expires_at:            expiresAt,
        },
        client
    );

    // Record the disbursement debit — money going OUT of the
    // platform's capital pool to the supplier as an advance.
    await this.vanRepo.appendLedgerEntry(
        {
        virtual_account_id: van.id,
        entry_type:         'debit',
        amount_cents:       cmd.expected_amount_cents,
        description:        `Financing advance for invoice ${invoice.invoice_number}`,
        idempotency_key:    `advance-${cmd.invoice_id}`,
        },
        client
    );

    await this.eventRepo.append(
        {
        invoice_id: cmd.invoice_id,
        event_type: 'van.created',
        payload: {
            virtual_account_id:    van.id,
            account_number:        accountNumber,
            ifsc_code:             ifscCode,
            expected_amount_cents: cmd.expected_amount_cents,
            expires_at:            expiresAt.toISOString(),
        },
        },
        client
    );

    await client.query('COMMIT');

    log.info(
        {
        invoice_id:     cmd.invoice_id,
        van_id:         van.id,
        account_number: accountNumber,
        expires_at:     expiresAt.toISOString(),
        },
        'VAN created successfully'
    );

    return van;

    } catch (err) {
    await client.query('ROLLBACK');
    log.error({ err, invoice_id: cmd.invoice_id }, 'Failed to create VAN');
    throw err;
    } finally {
    client.release();
    }
}

// ----------------------------------------------------------------
// recordPayment
// Called by the bank webhook when the buyer's payment arrives.
//
// Defence-in-depth idempotency strategy (two layers):
//
// Layer 1 — Application check (before transaction):
//   Query existing ledger entries and compare idempotency keys.
//   Catches duplicates without acquiring a DB transaction,
//   which is cheaper and avoids lock contention under high load.
//   This also correctly handles the case where the account is
//   already settled — a retry after settlement must still return
//   success, not an error.
//
// Layer 2 — Database constraint (inside transaction):
//   The UNIQUE constraint on ledger_entries.idempotency_key is
//   the final guard. If two webhook requests pass Layer 1
//   simultaneously (race condition), only one INSERT succeeds.
//   The loser gets a PG_UNIQUE_VIOLATION, caught below and
//   re-thrown as DuplicatePaymentError.
// ----------------------------------------------------------------
async recordPayment(cmd: RecordPaymentCommand): Promise<VanWithLedger> {
    log.info(
    { account_number: cmd.account_number, amount_cents: cmd.amount_cents,
        idempotency_key: cmd.idempotency_key },
    'Recording payment webhook'
    );

    const van = await this.vanRepo.findByAccountNumber(cmd.account_number);
    if (!van) {
    throw new VanNotFoundError(cmd.account_number);
    }

    if (van.status === 'expired') {
    throw new Error(
        `Virtual account ${cmd.account_number} has expired`
    );
    }

    // Layer 1: Application-level idempotency check.
    // Checked before the settled guard so that retried webhooks
    // arriving after settlement still return success rather than
    // throwing "already settled".
    const existingEntries = await this.vanRepo.getLedgerEntries(van.id);
    const isDuplicate = existingEntries.some(
    (e) => String(e.idempotency_key).trim() ===
            String(cmd.idempotency_key).trim()
    );

    if (isDuplicate) {
    log.info(
        { idempotency_key: cmd.idempotency_key, van_id: van.id },
        'Duplicate payment webhook — already processed, returning success'
    );
    throw new DuplicatePaymentError(cmd.idempotency_key);
    }

    // Only reject new money on a settled account.
    // (Duplicates are handled above regardless of settled status.)
    if (van.status === 'settled') {
    throw new Error(
        `Virtual account ${cmd.account_number} is already settled`
    );
    }

    const client = await pool.connect();

    try {
    await client.query('BEGIN');

    await this.vanRepo.appendLedgerEntry(
        {
        virtual_account_id: van.id,
        entry_type:         'credit',
        amount_cents:       cmd.amount_cents,
        description:        `Buyer payment received on ${cmd.paid_at.toISOString()}`,
        idempotency_key:    cmd.idempotency_key,
        },
        client
    );

    // Atomic SQL-level increment — safe against concurrent webhooks.
    // A read-modify-write pattern would lose one update under
    // concurrent load. The += in SQL is atomic at the engine level.
    const updated = await this.vanRepo.updateReceivedAmount(
        van.id,
        cmd.amount_cents,
        client
    );

    // Auto-settle when full expected amount received
    let finalVan = updated;

    if (
        Number(updated.received_amount_cents) >=
        Number(updated.expected_amount_cents)
    ) {
        finalVan = await this.vanRepo.settleAccount(van.id, client);

        await client.query(
        `UPDATE invoices
        SET status = 'REPAID', updated_at = now()
        WHERE id = $1`,
        [van.invoice_id]
        );

        await this.eventRepo.append(
        {
            invoice_id: van.invoice_id,
            event_type: 'invoice.repaid',
            payload: {
            virtual_account_id:    van.id,
            received_amount_cents: updated.received_amount_cents,
            idempotency_key:       cmd.idempotency_key,
            settled_at:            new Date().toISOString(),
            },
        },
        client
        );

        await client.query('COMMIT');

        // ── Enqueue PDF generation AFTER commit ───────────────────
        const invoice = await this.invoiceRepo.findById(van.invoice_id);
        if (invoice) {
        const payload: SettlementReceiptPdfPayload = {
            invoice_id:     invoice.id,
            invoice_number: invoice.invoice_number,
            supplier_id:    invoice.supplier_id,
            buyer_id:       invoice.buyer_id,
            amount_cents:   invoice.amount_cents,
            currency:       invoice.currency,
            settled_at:     new Date().toISOString(),
        };

        await this.documentQueue.add(
            JOB_TYPES.SETTLEMENT_RECEIPT_PDF,
            payload,
            { jobId: `receipt-${invoice.id}` }
        );

        log.info(
            { invoice_id: invoice.id },
            'Settlement receipt PDF job enqueued'
        );
        }

    } else {
        await client.query('COMMIT');
    }

    await client.query('COMMIT');

    const ledgerEntries = await this.vanRepo.getLedgerEntries(van.id);

    log.info(
        {
        van_id:          van.id,
        amount_cents:    cmd.amount_cents,
        is_fully_settled: finalVan.status === 'settled',
        },
        'Payment recorded successfully'
    );

    return {
        virtual_account:  finalVan,
        ledger_entries:   ledgerEntries,
        is_fully_settled: finalVan.status === 'settled',
    };

    } catch (err: unknown) {
    await client.query('ROLLBACK');

    // Layer 2: DB constraint catches the rare concurrent duplicate
    // that slipped past the application-level check.
    if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === PG_UNIQUE_VIOLATION
    ) {
        log.warn(
        { idempotency_key: cmd.idempotency_key },
        'DB unique constraint caught concurrent duplicate payment'
        );
        throw new DuplicatePaymentError(cmd.idempotency_key);
    }

    log.error(
        { err, account_number: cmd.account_number },
        'Failed to record payment'
    );
    throw err;
    } finally {
    client.release();
    }
}

// ----------------------------------------------------------------
// getVanDetails — read-only reconciliation view
// ----------------------------------------------------------------
async getVanDetails(invoiceId: string): Promise<VanWithLedger> {
    const van = await this.vanRepo.findByInvoiceId(invoiceId);
    if (!van) {
    throw new VanNotFoundError(invoiceId);
    }

    const ledgerEntries = await this.vanRepo.getLedgerEntries(van.id);

    return {
    virtual_account:  van,
    ledger_entries:   ledgerEntries,
    is_fully_settled: van.status === 'settled',
    };
}

private generateAccountNumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random    = Math.floor(1000 + Math.random() * 9000).toString();
    return `VSE${timestamp}${random}`;
}
}