import { Request, Response, NextFunction } from 'express';
import { idempotencyRepository }           from '../../core/database/container';
import { createLogger }                    from '../../core/utils/logger';

const log = createLogger('IdempotencyMiddleware');

// ----------------------------------------------------------------
// Maximum time we wait for a PROCESSING request to complete
// before returning 409. Prevents clients from waiting forever
// if the original request hung without cleaning up.
// ----------------------------------------------------------------
const PROCESSING_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS      = 500;

// ----------------------------------------------------------------
// idempotencyGuard
// Attach AFTER authenticate() — requires req.user to be set
// so keys are scoped to the authenticated organisation.
//
// Usage in router:
//   router.post('/', authenticate, idempotencyGuard, handler)
//
// The client must send:
//   Idempotency-Key: <any unique string, e.g. UUID or request hash>
//
// Behaviour:
//   First request  → processes normally, caches response
//   Retry request  → returns cached response immediately
//   In-progress    → polls for up to 30s, then returns 409
//   Expired key    → treated as a new request
// ----------------------------------------------------------------
export function idempotencyGuard(
req:  Request,
res:  Response,
next: NextFunction
): void {
// Only guard POST requests — GET/PUT/DELETE are naturally idempotent
if (req.method !== 'POST') {
    next();
    return;
}

// Run async logic — asyncHandler pattern applied inline
handleIdempotency(req, res, next).catch(next);
}

async function handleIdempotency(
req:  Request,
res:  Response,
next: NextFunction
): Promise<void> {

const idempotencyKey = req.headers['idempotency-key'];

// If no key is provided, pass through without enforcement.
// This keeps the middleware non-breaking for clients that
// do not yet send the header. To make the header required,
// change this block to return a 400 instead.
if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    next();
    return;
}

if (!req.user) {
    res.status(401).json({
    success: false,
    error: {
        code:    'UNAUTHENTICATED',
        message: 'Authentication required for idempotent requests',
    },
    });
    return;
}

const orgId = req.user.sub;
const path  = req.path;

log.debug(
    { idempotency_key: idempotencyKey, org_id: orgId, path },
    'Checking idempotency key'
);

const { record, isNew } = await idempotencyRepository.tryInsert(
    idempotencyKey,
    orgId,
    path
);

// ── New request: first time this key has been seen ─────────────
if (isNew) {
    log.debug(
    { idempotency_key: idempotencyKey },
    'New idempotency key — processing request'
    );

    // Intercept res.json() to capture the response for caching.
    // We wrap the original method so the handler behaves normally
    // but we get a copy of what it sends.
    const originalJson = res.json.bind(res);

    res.json = function (body: Record<string, unknown>) {
    const statusCode = res.statusCode ?? 200;

    // Cache only successful responses (2xx).
    // Do not cache 4xx/5xx — those represent transient or
    // client-side errors that the client should retry fresh.
    if (statusCode >= 200 && statusCode < 300) {
        idempotencyRepository
        .markCompleted(idempotencyKey, orgId, path, statusCode, body)
        .catch((err) =>
            log.error({ err }, 'Failed to cache idempotency response')
        );
    } else {
        // Mark as failed so the key is reusable
        idempotencyRepository
        .markFailed(idempotencyKey, orgId, path)
        .catch((err) =>
            log.error({ err }, 'Failed to mark idempotency key as failed')
        );
    }

    return originalJson(body);
    };

    next();
    return;
}

// ── Key already exists — handle by current status ──────────────

// COMPLETED: return the cached response immediately
if (record.status === 'COMPLETED') {
    log.info(
    { idempotency_key: idempotencyKey, cached_status: record.response_status },
    'Returning cached idempotent response'
    );

    res
    .status(record.response_status ?? 200)
    .setHeader('Idempotent-Replayed', 'true')
    .json(record.response_body);
    return;
}

// FAILED: allow client to retry with the same key
if (record.status === 'FAILED') {
    log.info(
    { idempotency_key: idempotencyKey },
    'Previous request failed — allowing retry with same key'
    );

    // Delete the failed record so tryInsert creates a fresh one
    await idempotencyRepository.deleteKey(idempotencyKey, orgId, path);
    const fresh = await idempotencyRepository.tryInsert(
    idempotencyKey, orgId, path
    );

    // Attach the same response-capture wrapper as the new request path
    const originalJson = res.json.bind(res);
    res.json = function (body: Record<string, unknown>) {
    const statusCode = res.statusCode ?? 200;
    if (statusCode >= 200 && statusCode < 300) {
        idempotencyRepository
        .markCompleted(idempotencyKey, orgId, path, statusCode, body)
        .catch((err) =>
            log.error({ err }, 'Failed to cache idempotency response on retry')
        );
    }
    return originalJson(body);
    };

    next();
    return;
}

// PROCESSING: another request is currently in flight.
// Poll the DB until it completes or we time out.
log.info(
    { idempotency_key: idempotencyKey },
    'Request is PROCESSING — polling for completion'
);

const deadline = Date.now() + PROCESSING_TIMEOUT_MS;

while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const { record: polled } = await idempotencyRepository.tryInsert(
    idempotencyKey, orgId, path
    );

    if (polled.status === 'COMPLETED') {
    log.info(
        { idempotency_key: idempotencyKey },
        'Concurrent request completed — returning cached response'
    );
    res
        .status(polled.response_status ?? 200)
        .setHeader('Idempotent-Replayed', 'true')
        .json(polled.response_body);
    return;
    }

    if (polled.status === 'FAILED') {
    res.status(409).json({
        success: false,
        error: {
        code:    'IDEMPOTENT_REQUEST_FAILED',
        message: 'The original request failed. Retry with a new Idempotency-Key.',
        },
    });
    return;
    }
}

// Timed out waiting for the concurrent request
log.warn(
    { idempotency_key: idempotencyKey },
    'Timed out waiting for concurrent request — returning 409'
);

res.status(409).json({
    success: false,
    error: {
    code:    'CONCURRENT_REQUEST_TIMEOUT',
    message:
        'A request with this Idempotency-Key is still being processed. ' +
        'Retry after 30 seconds or use a new key.',
    },
});
}

function sleep(ms: number): Promise<void> {
return new Promise((resolve) => setTimeout(resolve, ms));
}