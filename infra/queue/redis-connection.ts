import { Redis } from 'ioredis';
import { env }   from '../../core/config/env';

// ----------------------------------------------------------------
// createRedisConnection
// BullMQ requires a dedicated Redis connection per queue and per
// worker. Connections must NOT be shared between BullMQ instances
// because BullMQ uses Redis blocking commands (BRPOPLPUSH) that
// hold the connection exclusively.
//
// We export a factory function rather than a singleton so each
// caller gets its own connection — queue, worker, and scheduler
// each call this independently.
// ----------------------------------------------------------------
export function createRedisConnection(): Redis {
const connection = new Redis(env.REDIS_URL, {
    // BullMQ requirement: disable auto-reconnect on ECONNRESET
    // so BullMQ can manage its own reconnection lifecycle.
    maxRetriesPerRequest: null,

    // Retry failed connections with exponential backoff.
    // BullMQ workers should survive transient Redis restarts.
    retryStrategy(times: number) {
    if (times > 10) {
        console.error('Redis connection failed after 10 retries — giving up');
        return null;   // stop retrying
    }
    return Math.min(times * 200, 3000);   // max 3s between retries
    },
});

connection.on('error', (err) => {
    console.error('Redis connection error:', err.message);
});

connection.on('connect', () => {
    console.log('Redis connection established');
});

return connection;
}