// A no-op Queue stub for test environments.
// Replaces the real BullMQ Queue so tests do not require Redis.
export const nullQueue = {
  add:   async () => ({ id: 'test-job-id' }),
  close: async () => {},
} as never;