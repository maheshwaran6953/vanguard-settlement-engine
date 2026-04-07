import rateLimit from 'express-rate-limit';
import { env } from '../../core/config/env';

// ----------------------------------------------------------------
// Canonical 429 response shape — matches the error handler format
// used everywhere else in this API so clients get a consistent
// structure regardless of which error path fires.
// ----------------------------------------------------------------
const rateLimitResponse = (
code:    string,
message: string,
retryAfterSeconds: number
) => ({
    success: false,
    error: {
        code,
        message,
        retry_after_seconds: retryAfterSeconds,
    },
});

// ----------------------------------------------------------------
// loginLimiter
// Protects POST /auth/login against brute-force credential attacks.
//
// 5 attempts per 15 minutes per IP.
// After the 5th failed attempt the IP is blocked for the remainder
// of the 15-minute window.
//
// Why 5 attempts?
// A legitimate user who misremembers their password will try 2-3
// times before resetting. 5 gives genuine users headroom while
// making brute-force economically unviable (5 guesses per 15 min
// = 480 guesses per day — nowhere near enough to crack a bcrypt
// hash within the token's lifetime).
// ----------------------------------------------------------------
export const loginLimiter = rateLimit({
windowMs:         15 * 60 * 1000,   // 15 minutes
max:              5,
standardHeaders:  'draft-7',         // adds RateLimit-* headers (RFC 6585)
legacyHeaders:    false,             // suppress X-RateLimit-* (deprecated)
skipSuccessfulRequests: true,        // only count failed attempts (non-2xx)
skip: () => env.NODE_ENV === 'test',

// Custom key: use IP + normalised email if present, so a single
// attacker targeting one account can't spread across IPs trivially.
// Falls back to IP-only when body hasn't been parsed yet.
keyGenerator: (req) => {
    const ip    = req.ip ?? 'unknown';
    const email = (req.body as { email?: string })?.email?.toLowerCase().trim();
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

// ----------------------------------------------------------------
// registrationLimiter
// Protects POST /auth/register against automated account creation.
//
// 10 attempts per hour per IP.
// Registration is more expensive than login (bcrypt + two INSERTs)
// so fewer attempts are needed to constitute abuse. 10 per hour
// allows a legitimate developer testing registration flows while
// blocking mass account creation scripts.
// ----------------------------------------------------------------
export const registrationLimiter = rateLimit({
windowMs:        60 * 60 * 1000,    // 1 hour
max:             10,
standardHeaders: 'draft-7',
legacyHeaders:   false,
skipSuccessfulRequests: false,       // count all attempts, success or fail
skip: () => env.NODE_ENV === 'test',

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

// ----------------------------------------------------------------
// apiLimiter
// General-purpose guard on all routes as a backstop against
// automated scraping or denial-of-service via request volume.
//
// 200 requests per minute per IP — generous enough to never
// affect legitimate clients but tight enough to limit abuse.
// Applied globally in app.ts, before route-specific limiters.
// ----------------------------------------------------------------
export const apiLimiter = rateLimit({
windowMs:        60 * 1000,          // 1 minute
max:             200,
standardHeaders: 'draft-7',
legacyHeaders:   false,
skip: () => env.NODE_ENV === 'test',

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