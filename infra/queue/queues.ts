import { Queue }               from 'bullmq';
import { createRedisConnection } from './redis-connection';
import { QUEUE_NAMES }           from './registry';

// ----------------------------------------------------------------
// Default job options applied to every job unless overridden.
// ----------------------------------------------------------------
const defaultJobOptions = {
  // Retry failed jobs 3 times with exponential backoff.
  // Attempt 1: immediate, Attempt 2: 2s, Attempt 3: 4s
  attempts: 3,
  backoff: {
    type:  'exponential' as const,
    delay: 2000,
  },
  // Remove completed jobs after 24 hours to prevent Redis bloat.
  // Keep the last 100 completed jobs for debugging.
  removeOnComplete: { age: 86_400, count: 100 },
  // Keep failed jobs for 7 days — important for incident investigation.
  removeOnFail: { age: 7 * 86_400 },
};

// ----------------------------------------------------------------
// Queue instances — one per logical domain.
// Each queue gets its own Redis connection (BullMQ requirement).
// ----------------------------------------------------------------
export const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
  connection:     createRedisConnection(),
  prefix:         process.env['REDIS_JOB_QUEUE_PREFIX'] ?? 'vanguard',
  defaultJobOptions,
});

export const documentQueue = new Queue(QUEUE_NAMES.DOCUMENT, {
  connection:     createRedisConnection(),
  prefix:         process.env['REDIS_JOB_QUEUE_PREFIX'] ?? 'vanguard',
  defaultJobOptions,
});

export const riskQueue = new Queue(QUEUE_NAMES.RISK, {
  connection:     createRedisConnection(),
  prefix:         process.env['REDIS_JOB_QUEUE_PREFIX'] ?? 'vanguard',
  defaultJobOptions,
});

// ----------------------------------------------------------------
// Graceful shutdown helper.
// Call this in the HTTP server's SIGTERM handler so in-flight
// job additions complete before the process exits.
// ----------------------------------------------------------------
export async function closeQueues(): Promise<void> {
  await Promise.all([
    notificationQueue.close(),
    documentQueue.close(),
    riskQueue.close(),
  ]);
}