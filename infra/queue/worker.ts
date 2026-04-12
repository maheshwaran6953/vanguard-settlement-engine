// ----------------------------------------------------------------
// WORKER ENTRY POINT
// This file is the entry point for the worker process.
// Run separately from the HTTP server:
//   ts-node infra/queue/worker.ts
//
// The worker and the HTTP server share the same Redis instance
// but are completely independent Node processes. Crashing the
// worker does not affect HTTP serving. Crashing the HTTP server
// does not affect in-progress job execution.
// ----------------------------------------------------------------

import path   from 'path';
import dotenv from 'dotenv';

dotenv.config({
path: path.resolve(
    __dirname,
    '../../infra/config',
    `.env.${process.env['NODE_ENV'] ?? 'development'}`
),
});

import { Worker, Job }           from 'bullmq';
import { createRedisConnection }  from './redis-connection';
import { QUEUE_NAMES, JOB_TYPES } from './registry';
import { InvoiceApprovedHandler } from './jobs/invoice-approved.handler';
import { SettlementReceiptHandler } from './jobs/settlement-receipt.handler';
import { createLogger }           from '../../core/utils/logger';

const log = createLogger('Worker');

// Instantiate all job handlers
const handlers = {
[JOB_TYPES.INVOICE_APPROVED]:       new InvoiceApprovedHandler(),
[JOB_TYPES.SETTLEMENT_RECEIPT_PDF]: new SettlementReceiptHandler(),
};

// ----------------------------------------------------------------
// Notification Worker
// ----------------------------------------------------------------
const notificationWorker = new Worker(
QUEUE_NAMES.NOTIFICATION,
async (job: Job) => {
    const handler = handlers[job.name as keyof typeof handlers];

    if (!handler) {
    log.warn(
        { job_name: job.name, job_id: job.id },
        'No handler registered for job type — skipping'
    );
    return;
    }

    log.info(
    { queue: QUEUE_NAMES.NOTIFICATION, job_name: job.name, job_id: job.id },
    'Processing job'
    );

    await handler.handle(job);
},
{
    connection: createRedisConnection(),
    prefix:     process.env['REDIS_JOB_QUEUE_PREFIX'] ?? 'vanguard',
    // Process one job at a time per worker instance.
    // Increase concurrency when email throughput becomes a bottleneck.
    concurrency: 1,
}
);

// ----------------------------------------------------------------
// Document Worker
// ----------------------------------------------------------------
const documentWorker = new Worker(
QUEUE_NAMES.DOCUMENT,
async (job: Job) => {
    const handler = handlers[job.name as keyof typeof handlers];

    if (!handler) {
    log.warn(
        { job_name: job.name, job_id: job.id },
        'No handler registered for job type — skipping'
    );
    return;
    }

    log.info(
    { queue: QUEUE_NAMES.DOCUMENT, job_name: job.name, job_id: job.id },
    'Processing job'
    );

    await handler.handle(job);
},
{
    connection: createRedisConnection(),
    prefix:     process.env['REDIS_JOB_QUEUE_PREFIX'] ?? 'vanguard',
    concurrency: 1,
}
);

// ----------------------------------------------------------------
// Worker lifecycle events
// ----------------------------------------------------------------
[notificationWorker, documentWorker].forEach((worker) => {
    worker.on('completed', (job) => {
    log.info(
        { job_id: job.id, job_name: job.name },
        'Job completed successfully'
    );
    });

    worker.on('failed', (job, err) => {
    const isFinalAttempt =
        job !== undefined &&
        job.attemptsMade >= (job.opts.attempts ?? 1);

    if (isFinalAttempt) {
        log.error(
        {
            job_id:       job?.id,
            job_name:     job?.name,
            attempts:     job?.attemptsMade,
            err:          err.message,
            payload:      job?.data,
        },
        'Job exhausted all retries — moved to failed state. ' +
        'Use GET /admin/failed-jobs to inspect and retry.'
        );
    } else {
        log.warn(
        {
            job_id:          job?.id,
            job_name:        job?.name,
            attempt:         job?.attemptsMade,
            max_attempts:    job?.opts.attempts,
            err:             err.message,
            next_retry_in:   'exponential backoff',
        },
        'Job failed — will retry'
        );
    }
    });

    worker.on('error', (err) => {
    log.error({ err: err.message }, 'Worker error');
    });
});
log.info('Worker process started — listening for jobs');

// ----------------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------------
async function shutdown(): Promise<void> {
log.info('Worker shutting down gracefully...');
await Promise.all([
    notificationWorker.close(),
    documentWorker.close(),
]);
log.info('Worker shut down cleanly');
process.exit(0);
}

process.on('SIGTERM', () => { shutdown().catch(console.error); });
process.on('SIGINT',  () => { shutdown().catch(console.error); });