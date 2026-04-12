import { Job }                         from 'bullmq';
import { IJobHandler }                 from './job-handler.interface';
import { SettlementReceiptPdfPayload } from '../job-payloads';
import { generateSettlementReceipt }   from '../../pdf/receipt-generator';
import { pool }                        from '../../../core/database/pool';
import { createLogger }                from '../../../core/utils/logger';

const log = createLogger('SettlementReceiptHandler');

export class SettlementReceiptHandler
implements IJobHandler<SettlementReceiptPdfPayload>
{
async handle(job: Job<SettlementReceiptPdfPayload>): Promise<void> {
    const { data } = job;

    log.info(
    {
        job_id:         job.id,
        invoice_id:     data.invoice_id,
        invoice_number: data.invoice_number,
    },
    'Generating settlement receipt PDF'
    );

    // Generate the PDF and get the storage path
    const pdfPath = await generateSettlementReceipt(data);

    // Persist the path to the invoice record so it can be
    // retrieved and served to the supplier
    await pool.query(
    `UPDATE invoices
    SET pdf_receipt_path = $1,
        updated_at       = now()
    WHERE id = $2`,
    [pdfPath, data.invoice_id]
    );

    log.info(
    {
        job_id:     job.id,
        invoice_id: data.invoice_id,
        pdf_path:   pdfPath,
    },
    'Settlement receipt PDF saved and invoice record updated'
    );
}
}