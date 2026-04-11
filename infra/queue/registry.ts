// ----------------------------------------------------------------
// Queue name constants — single source of truth.
// Both the server (producer) and worker (consumer) import from here.
// Using string literals directly in queue.add() calls leads to
// typos that are silent at runtime — centralising prevents that.
// ----------------------------------------------------------------
export const QUEUE_NAMES = {
    NOTIFICATION: 'notification',   // email notifications
    DOCUMENT:     'document',       // PDF generation
    RISK:         'risk',           // async credit bureau calls (Phase 4.4+)
} as const;

// Job type names within each queue
export const JOB_TYPES = {
    // Notification queue
    INVOICE_SUBMITTED:          'invoice.submitted.notify',
    INVOICE_APPROVED:           'invoice.approved.notify',
    INVOICE_FUNDED:             'invoice.funded.notify',
    INVOICE_REPAID:             'invoice.repaid.notify',

    // Document queue
    SETTLEMENT_RECEIPT_PDF:     'settlement.receipt.pdf',
    INVOICE_SUMMARY_PDF:        'invoice.summary.pdf',

    // Risk queue
    CREDIT_BUREAU_CHECK:        'risk.credit.bureau.check',
} as const;

// Type helpers
export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
export type JobType   = typeof JOB_TYPES[keyof typeof JOB_TYPES];