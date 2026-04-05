import { pool }               from '../../database/pool';
import { IInvoiceRepository } from '../../repositories/invoice.repository';
import { IEventRepository }   from '../../repositories/event.repository';
import { assessInvoiceRisk }  from './risk.engine';
import {
AssessInvoiceRiskCommand,
RiskAssessmentResult,
} from './risk.types';
import { createLogger }       from '../../utils/logger';

const log = createLogger('RiskService');

export class InvoiceNotEligibleError extends Error {
constructor(invoiceId: string, status: string) {
    super(
    `Invoice ${invoiceId} is not eligible for risk assessment. ` +
    `Required status: FINANCING_REQUESTED. Current: ${status}`
    );
    this.name = 'InvoiceNotEligibleError';
}
}

export class RiskService {
constructor(
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly eventRepo:   IEventRepository,
) {}

// ----------------------------------------------------------------
// assessAndRecord
// Runs the three-layer risk engine, persists the full result as
// an immutable event, and drives the invoice state transition.
//
// APPROVE       → invoice stays FINANCING_REQUESTED
//                 (VAN service proceeds to disburse)
// MANUAL_REVIEW → invoice stays FINANCING_REQUESTED
//                 (flagged for human underwriter queue)
// REJECT        → invoice transitions to CANCELLED
//
// The risk engine itself is pure — no DB calls, no side effects.
// All persistence happens here in assessAndRecord so the engine
// remains independently testable without a database.
// ----------------------------------------------------------------
async assessAndRecord(
    cmd:     AssessInvoiceRiskCommand,
    actorId: string
): Promise<RiskAssessmentResult> {

    log.info(
    { invoice_id: cmd.invoice_id, actor_id: actorId },
    'Starting risk assessment'
    );

    const invoice = await this.invoiceRepo.findById(cmd.invoice_id);
    if (!invoice) {
    throw new Error(`Invoice not found: ${cmd.invoice_id}`);
    }

    if (invoice.status !== 'FINANCING_REQUESTED') {
    throw new InvoiceNotEligibleError(cmd.invoice_id, invoice.status);
    }

    // Pure risk engine — synchronous, no I/O.
    // In production, the buyer risk scorer makes async calls to
    // external credit bureaus. Wrap those in Promise.all before
    // passing signals into assessInvoiceRisk.
    const result = assessInvoiceRisk(cmd);

    log.info(
    {
        invoice_id:       cmd.invoice_id,
        decision:         result.decision,
        confidence_score: result.confidence_score,
        reason_code:      result.reason_code,
        buyer_risk_score: result.buyer_risk_score,
        anomaly_score:    result.anomaly_result.score,
    },
    'Risk assessment complete'
    );

    const client = await pool.connect();

    try {
    await client.query('BEGIN');

    // Persist the full assessment payload as an immutable event.
    // This is the compliance record — every factor that influenced
    // the funding decision is stored here permanently.
    await this.eventRepo.append(
        {
        invoice_id: cmd.invoice_id,
        event_type: `risk.assessment.${result.decision.toLowerCase()}`,
        payload: {
            decision:         result.decision,
            confidence_score: result.confidence_score,
            reason_code:      result.reason_code,
            reason_message:   result.reason_message,
            buyer_risk_score: result.buyer_risk_score,
            anomaly_score:    result.anomaly_result.score,
            anomaly_flags:    result.anomaly_result.flags,
            three_way_match:  result.three_way_match,
            assessed_at:      result.assessed_at.toISOString(),
        },
        actor_id: actorId,
        },
        client
    );

    // State transition: only REJECT changes the invoice status here.
    // APPROVE and MANUAL_REVIEW leave the invoice in
    // FINANCING_REQUESTED — the next service in the flow handles
    // the FUNDED transition.
    if (result.decision === 'REJECT') {
        await this.invoiceRepo.updateStatus(
        cmd.invoice_id,
        'CANCELLED',
        client
        );

        log.warn(
        {
            invoice_id:  cmd.invoice_id,
            reason_code: result.reason_code,
        },
        'Invoice rejected by risk engine — status set to CANCELLED'
        );
    }

    await client.query('COMMIT');
    return result;

    } catch (err) {
    await client.query('ROLLBACK');
    log.error(
        { err, invoice_id: cmd.invoice_id },
        'Risk assessment transaction failed — rolled back'
    );
    throw err;
    } finally {
    client.release();
    }
}
}