import { pool }               from '../../database/pool';
import { IInvoiceRepository } from '../../repositories/invoice.repository';
import { IEventRepository }   from '../../repositories/event.repository';
import { assessInvoiceRisk }  from './risk.engine';
import {
  AssessInvoiceRiskCommand,
  RiskAssessmentResult,
} from './risk.types';

export class RiskService {
  constructor(
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly eventRepo:   IEventRepository,
  ) {}

  // ----------------------------------------------------------------
  // assessAndRecord
  // Runs the risk engine, persists the result as an event, and
  // drives the invoice status transition based on the decision.
  //
  // APPROVE       → invoice stays FINANCING_REQUESTED
  //                 (VAN service proceeds to disburse funds)
  // MANUAL_REVIEW → invoice stays FINANCING_REQUESTED
  //                 (flagged for human underwriter review)
  // REJECT        → invoice transitions to CANCELLED
  // ----------------------------------------------------------------
  async assessAndRecord(
    cmd: AssessInvoiceRiskCommand,
    actorId: string
  ): Promise<RiskAssessmentResult> {

    const invoice = await this.invoiceRepo.findById(cmd.invoice_id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${cmd.invoice_id}`);
    }

    if (invoice.status !== 'FINANCING_REQUESTED') {
      throw new Error(
        `Risk assessment requires FINANCING_REQUESTED status. ` +
        `Current status: ${invoice.status}`
      );
    }

    // Risk engine runs synchronously — pure functions, no DB calls.
    // In production the buyer-risk scorer would make async API calls
    // to external credit bureaus. Wrap those in Promise.all here.
    const result = assessInvoiceRisk(cmd);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Persist the full assessment as an event
      await this.eventRepo.append(
        {
          invoice_id: cmd.invoice_id,
          event_type: `risk.assessment.${result.decision.toLowerCase()}`,
          payload:    {
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

      // Drive state transition on rejection only.
      // Approval leaves the invoice in FINANCING_REQUESTED —
      // the disbursement flow (next step) moves it to FUNDED.
      if (result.decision === 'REJECT') {
        await this.invoiceRepo.updateStatus(
          cmd.invoice_id,
          'CANCELLED',
          client
        );
      }

      await client.query('COMMIT');
      return result;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}