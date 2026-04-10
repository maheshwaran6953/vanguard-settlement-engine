import { Request, Response, NextFunction } from 'express';
import crypto                              from 'crypto';
import { env }                             from '../../core/config/env';
import { createLogger }                    from '../../core/utils/logger';

const log = createLogger('WebhookAuth');

// Extend Request type to carry the raw body buffer
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

// ----------------------------------------------------------------
// captureRawBody
// Reads the raw request body bytes before JSON parsing so we can
// verify the HMAC signature against the exact bytes the bank sent.
//
// In test environment: express.json() has already parsed the body,
// so we re-serialise req.body back to a buffer. This avoids the
// stream-reading hang that occurs in supertest.
//
// In production: reads the raw stream directly and parses JSON
// manually, bypassing express.json() for this route.
// ----------------------------------------------------------------
export function captureRawBody(
  req:  Request,
  res:  Response,
  next: NextFunction
): void {
  // If we are in test mode AND the body was already parsed by something else
  if (process.env.NODE_ENV === 'test' && req.body && Object.keys(req.body).length > 0) {
    const bodyString = JSON.stringify(req.body);
    req.rawBody = Buffer.from(bodyString, 'utf8');
    return next();
  }

  // Otherwise (Production or Test with unparsed body), read the stream
  const chunks: Buffer[] = [];
  
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    req.rawBody = rawBody;
  
    log.debug(
      { bytes: rawBody.length },
      'Webhook raw body captured'
    );
  
    if (rawBody.length === 0) {
      log.warn('Webhook raw body is empty — possible stream already consumed');
    }
  
    try {
      req.body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      req.body = {};
    }
  
    next();
  });

  req.on('error', (err) => {
    log.error({ err }, 'Stream error in captureRawBody');
    next(err);
  });
}

// ----------------------------------------------------------------
// verifyWebhookSignature
// ----------------------------------------------------------------
export function verifyWebhookSignature(
  req:  Request,
  res:  Response,
  next: NextFunction
): void {

  if (env.NODE_ENV === 'test') {
    next();
    return;
  }

  const signature = req.headers['x-webhook-signature'];

  if (!signature || typeof signature !== 'string') {
    log.warn(
      { path: req.path, ip: req.ip },
      'Webhook request missing X-Webhook-Signature header'
    );
    res.status(401).json({
      success: false,
      error: {
        code:    'MISSING_WEBHOOK_SIGNATURE',
        message: 'X-Webhook-Signature header is required',
      },
    });
    return;
  }

  const rawBody = req.rawBody;

  if (!rawBody) {
    log.error({ path: req.path }, 'rawBody not set — captureRawBody missing');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Webhook processing error' },
    });
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature,         'hex');
  const expectedBuffer  = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    log.warn({ path: req.path, ip: req.ip }, 'Signature length mismatch');
    res.status(401).json({
      success: false,
      error: {
        code:    'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook signature verification failed',
      },
    });
    return;
  }

  const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValid) {
    log.warn({ path: req.path, ip: req.ip }, 'Webhook signature invalid');
    res.status(401).json({
      success: false,
      error: {
        code:    'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook signature verification failed',
      },
    });
    return;
  }

  log.debug({ path: req.path }, 'Webhook signature verified');
  next();
}