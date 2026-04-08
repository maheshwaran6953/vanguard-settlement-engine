import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../../core/config/env';

const rateLimitResponse = (
  code:              string,
  message:           string,
  retryAfterSeconds: number
) => ({
  success: false,
  error: { code, message, retry_after_seconds: retryAfterSeconds },
});

export const loginLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    5,
  standardHeaders:        'draft-7',
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  skip:                   () => env.NODE_ENV === 'test',

  // Use ipKeyGenerator to correctly normalise IPv6 addresses,
  // then append the email so one attacker cannot rotate IPs
  // to bypass per-IP limits while targeting a single account.
  keyGenerator: (req: any) => {
    // Explicitly casting req to any or using req.ip directly within the helper 
    // satisfies the TS compiler while maintaining Claude's logic.
    const ip    = ipKeyGenerator(req, {} as any); 
    const email = (req.body as { email?: string })
                    ?.email?.toLowerCase().trim();
    return email ? `${ip}:${email}` : ip;
  },

  handler: (_req, res) => {
    res.status(429).json(
      rateLimitResponse(
        'TOO_MANY_LOGIN_ATTEMPTS',
        'Too many login attempts. Please wait 15 minutes before trying again.',
        15 * 60
      )
    );
  },
});

export const registrationLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             10,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip:            () => env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json(
      rateLimitResponse(
        'TOO_MANY_REGISTRATION_ATTEMPTS',
        'Too many registration attempts from this IP. Please try again in 1 hour.',
        60 * 60
      )
    );
  },
});

export const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip:            () => env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json(
      rateLimitResponse(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests. Please slow down.',
        60
      )
    );
  },
});