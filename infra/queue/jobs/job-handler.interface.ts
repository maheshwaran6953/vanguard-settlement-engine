import { Job } from 'bullmq';

// Every job handler must implement this interface.
// This enforces a consistent contract across all job types and
// makes the worker dispatcher typesafe.
export interface IJobHandler<T = unknown> {
    handle(job: Job<T>): Promise<void>;
}