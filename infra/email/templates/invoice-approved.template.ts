import { InvoiceApprovedPayload } from '../../queue/job-payloads';

// ----------------------------------------------------------------
// Format paise to rupees for display.
// Never use this for arithmetic — display only.
// ----------------------------------------------------------------
function formatCurrency(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-IN', {
    style:    'currency',
    currency: currency,
  }).format(amount);
}

export function invoiceApprovedHtml(data: InvoiceApprovedPayload): string {
  const amount   = formatCurrency(data.amount_cents, data.currency);
  const dueDate  = new Date(data.due_date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const approved = new Date(data.approved_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Approved — Vanguard Settlement Engine</title>
  <style>
    body        { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                  sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container  { max-width: 560px; margin: 0 auto; background: #ffffff;
                  border-radius: 8px; overflow: hidden;
                  border: 1px solid #e0e0e0; }
    .header     { background: #1a1a2e; color: #ffffff; padding: 28px 32px; }
    .header h1  { margin: 0; font-size: 22px; font-weight: 500; }
    .header p   { margin: 6px 0 0; font-size: 13px; opacity: 0.7; }
    .body       { padding: 32px; }
    .status     { background: #e8f5e9; border-left: 4px solid #2e7d32;
                  padding: 14px 16px; border-radius: 4px; margin-bottom: 24px; }
    .status p   { margin: 0; color: #1b5e20; font-weight: 500; }
    .detail-row { display: flex; justify-content: space-between;
                  padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-row:last-child { border-bottom: none; }
    .label      { color: #666; font-size: 13px; }
    .value      { font-weight: 500; font-size: 13px; text-align: right; }
    .amount     { font-size: 22px; font-weight: 600; color: #1a1a2e; }
    .cta        { margin-top: 28px; text-align: center; }
    .cta a      { background: #1a1a2e; color: #ffffff; text-decoration: none;
                  padding: 12px 28px; border-radius: 6px; font-size: 14px;
                  display: inline-block; }
    .footer     { padding: 20px 32px; background: #fafafa;
                  border-top: 1px solid #f0f0f0; font-size: 12px;
                  color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Vanguard Settlement Engine</h1>
      <p>Invoice Financing Platform</p>
    </div>
    <div class="body">
      <div class="status">
        <p>Your invoice has been approved by the buyer.</p>
      </div>
      <div class="detail-row">
        <span class="label">Invoice number</span>
        <span class="value">${data.invoice_number}</span>
      </div>
      <div class="detail-row">
        <span class="label">Invoice amount</span>
        <span class="value amount">${amount}</span>
      </div>
      <div class="detail-row">
        <span class="label">Due date</span>
        <span class="value">${dueDate}</span>
      </div>
      <div class="detail-row">
        <span class="label">Approved on</span>
        <span class="value">${approved}</span>
      </div>
      <div class="cta">
        <a href="#">Request Financing</a>
      </div>
    </div>
    <div class="footer">
      This is an automated notification from Vanguard Settlement Engine.
      Do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

export function invoiceApprovedText(data: InvoiceApprovedPayload): string {
  const amount = formatCurrency(data.amount_cents, data.currency);
  return `
Invoice Approved — Vanguard Settlement Engine

Your invoice ${data.invoice_number} for ${amount} has been approved by the buyer.
Due date: ${data.due_date}
Approved: ${data.approved_at}

Log in to request financing against this invoice.

---
Automated notification from Vanguard Settlement Engine.
`.trim();
}