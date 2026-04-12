import { Queue, Job }              from 'bullmq';
import { notificationQueue,
         documentQueue }           from './queues';
import { createLogger }            from '../../core/utils/logger';

const log = createLogger('FailedJobsRepository');

export interface FailedJobSummary {
  id:           string | undefined;
  queue:        string;
  job_name:     string;
  failed_reason: string;
  attempts_made: number;
  failed_at:    number | undefined;
  payload:      unknown;
}

// ----------------------------------------------------------------
// getAllFailedJobs
// Fetches failed jobs from every queue and returns a unified list.
// BullMQ stores failed jobs in Redis under the queue's failed set.
// ----------------------------------------------------------------
export async function getAllFailedJobs(): Promise<FailedJobSummary[]> {
  const queues: Array<{ queue: Queue; name: string }> = [
    { queue: notificationQueue, name: 'notification' },
    { queue: documentQueue,     name: 'document'     },
  ];

  const results: FailedJobSummary[] = [];

  for (const { queue, name } of queues) {
    try {
      const failed = await queue.getFailed();
      for (const job of failed) {
        results.push({
          id:            job.id,
          queue:         name,
          job_name:      job.name,
          failed_reason: job.failedReason ?? 'Unknown',
          attempts_made: job.attemptsMade,
          failed_at:     job.finishedOn,
          payload:       job.data,
        });
      }
    } catch (err) {
      log.error({ err, queue: name }, 'Failed to fetch failed jobs');
    }
  }

  // Most recently failed first
  return results.sort(
    (a, b) => (b.failed_at ?? 0) - (a.failed_at ?? 0)
  );
}

// ----------------------------------------------------------------
// retryFailedJob
// Moves a specific failed job back to the waiting state.
// Use this after fixing the underlying issue that caused the failure.
// ----------------------------------------------------------------
export async function retryFailedJob(
  queueName: string,
  jobId:     string
): Promise<void> {
  const queueMap: Record<string, Queue> = {
    notification: notificationQueue,
    document:     documentQueue,
  };

  const queue = queueMap[queueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await Job.fromId(queue, jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found in queue ${queueName}`);
  }

  await job.retry();
  log.info({ queue: queueName, job_id: jobId }, 'Job retried manually');
}

// ----------------------------------------------------------------
// discardFailedJob
// Permanently removes a failed job from Redis.
// Use when the job is unrecoverable (e.g. invalid payload).
// ----------------------------------------------------------------
export async function discardFailedJob(
  queueName: string,
  jobId:     string
): Promise<void> {
  const queueMap: Record<string, Queue> = {
    notification: notificationQueue,
    document:     documentQueue,
  };

  const queue = queueMap[queueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await Job.fromId(queue, jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found in queue ${queueName}`);
  }

  await job.remove();
  log.info({ queue: queueName, job_id: jobId }, 'Failed job discarded');
}