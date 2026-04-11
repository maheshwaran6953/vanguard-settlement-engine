import { Job }         from 'bullmq';
import { IJobHandler } from './job-handler.interface';
import { InvoiceApprovedPayload } from '../job-payloads';
import { createLogger } from '../../../core/utils/logger';

const log = createLogger('InvoiceApprovedHandler');

// ----------------------------------------------------------------
// InvoiceApprovedHandler
// Sends an email to the supplier when their invoice is approved
// by the buyer. Full email implementation in Step 4.3.
// This placeholder logs the job and returns so the queue
// infrastructure can be verified before email is wired up.
// ----------------------------------------------------------------
export class InvoiceApprovedHandler
  implements IJobHandler<InvoiceApprovedPayload>
{
  async handle(job: Job<InvoiceApprovedPayload>): Promise<void> {
    log.info(
      {
        job_id:         job.id,
        invoice_id:     job.data.invoice_id,
        invoice_number: job.data.invoice_number,
        supplier_email: job.data.supplier_email,
      },
      'Processing invoice approved notification — email implementation pending'
    );

    // Simulate async work so the queue flow is testable
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    log.info(
      { job_id: job.id, invoice_id: job.data.invoice_id },
      'Invoice approved notification job completed'
    );
  }
}