import { pool }            from '../database/pool';
import { IVanRepository }  from '../repositories/van.repository';
import { IInvoiceRepository } from '../repositories/invoice.repository';
import { IEventRepository }   from '../repositories/event.repository';
import {
CreateVanCommand,
RecordPaymentCommand,
VanWithLedger,
} from './van.service.types';
import { VirtualAccount }  from '../domain/entities';

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
    private readonly vanRepo:     IVanRepository,
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly eventRepo:   IEventRepository,
) {}

// ----------------------------------------------------------------
// createVan
// Called immediately after an invoice reaches FINANCING_REQUESTED.
// Generates a unique virtual account number for this invoice.
//
// Business rules:
//   1. Invoice must be in FINANCING_REQUESTED status
//   2. No VAN must already exist for this invoice (1-to-1 enforced
//      by DB UNIQUE constraint on virtual_accounts.invoice_id)
//   3. VAN expires after 90 days — standard invoice payment term
// ----------------------------------------------------------------
async createVan(cmd: CreateVanCommand): Promise<VirtualAccount> {

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

    // Generate a unique virtual account number.
    // Format: VSE + 8-digit timestamp suffix + 4-digit random
    // In production, this number comes from your banking partner's
    // VAN issuance API (e.g. YES Bank, RazorpayX).
    const accountNumber = this.generateAccountNumber();
    const ifscCode      = 'YESB0CMSNOC';   // YES Bank CMS IFSC

    // VAN expires 90 days from now — aligns with invoice due_date window
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

    // Record the disbursement debit — the platform is
    // advancing funds TO the supplier. This is money going OUT
    // of the platform's pool.
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
        payload:    {
            virtual_account_id: van.id,
            account_number:     accountNumber,
            ifsc_code:          ifscCode,
            expected_amount_cents: cmd.expected_amount_cents,
            expires_at:         expiresAt.toISOString(),
        },
        },
        client
    );

    await client.query('COMMIT');
    return van;

    } catch (err) {
    await client.query('ROLLBACK');
    throw err;
    } finally {
    client.release();
    }
}

// ----------------------------------------------------------------
// recordPayment
// Called by the bank webhook handler when the buyer's payment
// arrives into the virtual account.
//
// This is the most critical method in the platform.
// It must be:
//   - Idempotent: same webhook twice = same result, no double-credit
//   - Atomic:     ledger entry + amount update in one transaction
//   - Correct:    auto-settle when received >= expected
// ----------------------------------------------------------------
async recordPayment(cmd: RecordPaymentCommand): Promise<VanWithLedger> {
    // 1. Fetch the account
    const van = await this.vanRepo.findByAccountNumber(cmd.account_number);
    if (!van) {
        throw new VanNotFoundError(cmd.account_number);
    }

    // 2. Check for expiry first
    if (van.status === 'expired') {
        throw new Error(`Virtual account ${cmd.account_number} has expired`);
    }

    // 3. IDEMPOTENCY CHECK: Direct Database lookup is safer than .find()
    const entries = await this.vanRepo.getLedgerEntries(van.id);
    const isDuplicate = entries.some(e => 
        String(e.idempotency_key).trim() === String(cmd.idempotency_key).trim()
    );

    if (isDuplicate) {
        // This is the "Magic" fix: If it's a duplicate, we STOP here and return success
        // to the router, regardless of whether the account is settled or not.
        throw new DuplicatePaymentError(cmd.idempotency_key);
    }

    // 4. NOW check for settled status. 
    // If we are here, it's NOT a duplicate, so we should reject new money.
    if (van.status === 'settled') {
        throw new Error(`Virtual account ${cmd.account_number} is already settled`);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Append the ledger entry
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

        // Atomic update
        const updated = await this.vanRepo.updateReceivedAmount(
            van.id,
            cmd.amount_cents,
            client
        );

        let finalVan = updated;
        // Check if we need to settle
        if (Number(updated.received_amount_cents) >= Number(updated.expected_amount_cents)) {
            finalVan = await this.vanRepo.settleAccount(van.id, client);

            await client.query(
                `UPDATE invoices SET status = 'REPAID', updated_at = now() WHERE id = $1`,
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
        }

        await client.query('COMMIT');
        const ledgerEntries = await this.vanRepo.getLedgerEntries(van.id);

        return {
            virtual_account:  finalVan,
            ledger_entries:   ledgerEntries,
            is_fully_settled: finalVan.status === 'settled',
        };

    } catch (err: unknown) {
        await client.query('ROLLBACK');
        // Final fallback: If a race condition happened and two requests hit the DB
        // at the exact same microsecond, the DB UNIQUE constraint will save us.
        if (
            typeof err === 'object' && err !== null && 'code' in err &&
            (err as { code: string }).code === PG_UNIQUE_VIOLATION
        ) {
            throw new DuplicatePaymentError(cmd.idempotency_key);
        }
        throw err;
    } finally {
        client.release();
    }
}

// ----------------------------------------------------------------
// getVanDetails
// Read-only. Returns VAN state with full ledger for reconciliation.
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

// ----------------------------------------------------------------
// Private: account number generation
// In production, call your banking partner's VAN issuance API here.
// ----------------------------------------------------------------
private generateAccountNumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random    = Math.floor(1000 + Math.random() * 9000).toString();
    return `VSE${timestamp}${random}`;
}
}