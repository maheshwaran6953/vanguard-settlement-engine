import { Job }                    from 'bullmq';
import { IJobHandler }            from './job-handler.interface';
import { InvoiceApprovedPayload } from '../job-payloads';
import { sendEmail }              from '../../email/mailer';
import {
invoiceApprovedHtml,
invoiceApprovedText,
} from '../../email/templates/invoice-approved.template';
import { createLogger }           from '../../../core/utils/logger';

const log = createLogger('InvoiceApprovedHandler');

export class InvoiceApprovedHandler
implements IJobHandler<InvoiceApprovedPayload>
{
async handle(job: Job<InvoiceApprovedPayload>): Promise<void> {
    const { data } = job;

    log.info(
    {
        job_id:         job.id,
        invoice_id:     data.invoice_id,
        invoice_number: data.invoice_number,
        supplier_email: data.supplier_email,
    },
    'Sending invoice approved notification email'
    );

    await sendEmail({
    to:      data.supplier_email,
    subject: `Invoice ${data.invoice_number} approved — request financing now`,
    html:    invoiceApprovedHtml(data),
    text:    invoiceApprovedText(data),
    });

    log.info(
    { job_id: job.id, invoice_id: data.invoice_id },
    'Invoice approved notification sent'
    );
}
}