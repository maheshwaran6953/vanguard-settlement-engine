import PDFDocument                  from 'pdfkit';
import fs                           from 'fs';
import path                         from 'path';
import { SettlementReceiptPdfPayload } from '../queue/job-payloads';
import { createLogger }             from '../../core/utils/logger';

const log = createLogger('ReceiptGenerator');

// ----------------------------------------------------------------
// Storage root — relative to project root, not this file.
// In production this would be an S3 bucket path. For the MVP
// we write to the local filesystem.
// ----------------------------------------------------------------
const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'receipts');

function formatCurrency(amountCents: number, currency: string): string {
    const amount = (amountCents / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${currency} ${amount}`; // Returns "INR 5,000.00"
  }

function formatDate(isoString: string): string {
return new Date(isoString).toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
});
}

// ----------------------------------------------------------------
// generateSettlementReceipt
// Creates a PDF settlement receipt and writes it to disk.
// Returns the relative path of the generated file.
// ----------------------------------------------------------------
export async function generateSettlementReceipt(
data: SettlementReceiptPdfPayload
): Promise<string> {

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

const filename = `receipt-${data.invoice_id}-${Date.now()}.pdf`;
const absolutePath = path.join(STORAGE_ROOT, filename);
const relativePath = path.join('storage', 'receipts', filename);

log.info(
    { invoice_id: data.invoice_id, filename },
    'Generating settlement receipt PDF'
);

return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(absolutePath);

    doc.pipe(stream);

    // ── Header ────────────────────────────────────────────────────
    doc
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('Vanguard Settlement Engine', 50, 50);

    doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#666666')
    .text('Invoice Financing Platform', 50, 76);

    // Horizontal rule
    doc
    .moveTo(50, 100)
    .lineTo(545, 100)
    .strokeColor('#e0e0e0')
    .lineWidth(1)
    .stroke();

    // ── Title ─────────────────────────────────────────────────────
    doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor('#1a1a2e')
    .text('Settlement Receipt', 50, 120);

    doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#666666')
    .text(`Receipt generated: ${formatDate(new Date().toISOString())}`, 50, 142);

    // ── Status badge area ─────────────────────────────────────────
    doc
    .roundedRect(50, 168, 495, 36, 4)
    .fillColor('#e8f5e9')
    .fill();

    doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor('#2e7d32')
    .text('FULLY SETTLED', 66, 180);

    doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#388e3c')
    .text(`Settled on ${formatDate(data.settled_at)}`, 200, 181);

    // ── Invoice details table ─────────────────────────────────────
    const tableTop  = 230;
    const colLabel  = 50;
    const colValue  = 320;
    const rowHeight = 32;

    const rows = [
    ['Invoice Number',  data.invoice_number],
    ['Invoice Amount',  formatCurrency(data.amount_cents, data.currency)],
    ['Currency',        data.currency],
    ['Supplier ID',     data.supplier_id],
    ['Buyer ID',        data.buyer_id],
    ['Settlement Date', formatDate(data.settled_at)],
    ];

    rows.forEach((row, index) => {
    const y          = tableTop + index * rowHeight;
    const isEven     = index % 2 === 0;
    const bgColour   = isEven ? '#fafafa' : '#ffffff';

    // Row background
    doc
        .rect(50, y, 495, rowHeight)
        .fillColor(bgColour)
        .fill();

    // Label
    doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(row[0]!, colLabel, y + 10);

    // Value
    doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#1a1a2e')
        .text(row[1]!, colValue, y + 10);
    });

    // Border around table
    doc
    .rect(50, tableTop, 495, rows.length * rowHeight)
    .strokeColor('#e0e0e0')
    .lineWidth(0.5)
    .stroke();

    // ── Amount highlight ──────────────────────────────────────────
    const amountY = tableTop + rows.length * rowHeight + 24;

    doc
    .roundedRect(50, amountY, 495, 60, 4)
    .fillColor('#1a1a2e')
    .fill();

    doc
    .fontSize(12)
    .font('Helvetica')
    .fillColor('#ffffff')
    .text('Total Settlement Amount', 66, amountY + 14);

    doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .fillColor('#ffffff')
    .text(
        formatCurrency(data.amount_cents, data.currency),
        66,
        amountY + 30
    );

    // ── Footer ────────────────────────────────────────────────────
    const footerY = amountY + 100;

    doc
    .moveTo(50, footerY)
    .lineTo(545, footerY)
    .strokeColor('#e0e0e0')
    .lineWidth(0.5)
    .stroke();

    doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#999999')
    .text(
        'This is a system-generated settlement receipt from Vanguard Settlement Engine. ' +
        'This document serves as proof that the invoice financing has been fully repaid.',
        50,
        footerY + 12,
        { width: 495, align: 'center' }
    );

    doc
    .fontSize(9)
    .fillColor('#cccccc')
    .text(
        `Invoice ID: ${data.invoice_id}`,
        50,
        footerY + 42,
        { width: 495, align: 'center' }
    );

    // ── Finalise ──────────────────────────────────────────────────
    doc.end();

    stream.on('finish', () => {
    log.info(
        { invoice_id: data.invoice_id, path: relativePath },
        'Settlement receipt PDF generated'
    );
    resolve(relativePath);
    });

    stream.on('error', (err) => {
    log.error({ err, invoice_id: data.invoice_id }, 'PDF write failed');
    reject(err);
    });
});
}