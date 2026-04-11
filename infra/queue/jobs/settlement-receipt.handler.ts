import { Job }         from 'bullmq';
import { IJobHandler } from './job-handler.interface';
import { SettlementReceiptPdfPayload } from '../job-payloads';
import { createLogger } from '../../../core/utils/logger';

const log = createLogger('SettlementReceiptHandler');

export class SettlementReceiptHandler
implements IJobHandler<SettlementReceiptPdfPayload>
{
async handle(job: Job<SettlementReceiptPdfPayload>): Promise<void> {
    log.info(
    {
        job_id:         job.id,
        invoice_id:     job.data.invoice_id,
        invoice_number: job.data.invoice_number,
    },
    'Processing settlement receipt PDF — implementation pending'
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    log.info(
    { job_id: job.id, invoice_id: job.data.invoice_id },
    'Settlement receipt job completed'
    );
}
}