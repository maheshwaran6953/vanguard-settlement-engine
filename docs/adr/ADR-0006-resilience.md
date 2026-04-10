# ADR-0006: Resilience and Security Hardening Patterns

**Date:** 2026-04-10
**Status:** Accepted
**Deciders:** Engineering Lead

---

## Context

Phase 2 delivered a functionally correct platform. Before adding async
infrastructure in Phase 4, the HTTP surface needed hardening against
three classes of attack that are specific to financial APIs:

- **Replay attacks** on POST endpoints (duplicate invoice creation)
- **Brute-force attacks** on authentication endpoints
- **Forged webhook notifications** that could trigger fraudulent settlement

Additionally, the API was missing standard HTTP security headers required
by OWASP for any application handling financial data.

---

## Decisions

### 1. DB-backed HTTP Idempotency Keys (Step 3.1)

**Decision:** Store idempotency keys in PostgreSQL rather than Redis.

**Rationale:** Redis provides lower latency but requires an additional
infrastructure dependency. For the MVP, PostgreSQL offers stronger
durability guarantees — a Redis restart loses in-memory keys and
could allow duplicate processing during the window before keys are
re-established. PostgreSQL idempotency keys survive restarts and
participate in the same ACID guarantees as the rest of the platform.

**Migration path:** In Phase 4, when Redis is introduced for BullMQ,
we will evaluate moving idempotency key storage to Redis with a 24-hour
TTL. The repository interface (`IIdempotencyRepository`) ensures this
migration requires no changes to the middleware or business logic.

**Key design choices:**
- Keys scoped to `(idempotency_key, org_id, request_path)` — prevents
  cross-org key collisions and prevents key reuse across different endpoints
- `PROCESSING` state with polling prevents duplicate concurrent processing
- 24-hour TTL balances client retry windows against storage cost

### 2. Rate Limiting Thresholds (Step 3.2)

**Decision:** Three-tier rate limiting: endpoint-specific for auth,
global backstop for all routes.

| Limiter | Limit | Window | Rationale |
|---------|-------|--------|-----------|
| Login | 5 attempts | 15 minutes | Prevents brute-force; 5 attempts covers legitimate typos |
| Registration | 10 attempts | 1 hour | Prevents mass account creation; covers developer testing |
| Global API | 200 requests | 1 minute | Backstop against scraping and DoS; generous for legitimate use |

**Login key strategy:** Keys combine IP address and normalised email
address. This prevents an attacker targeting one account from cycling
IP addresses to bypass per-IP limits. It also prevents one attacker's
lockout from affecting other users on shared IPs (e.g. office networks).

**Test environment:** All limiters use `skip: () => NODE_ENV === 'test'`
to prevent integration test failures caused by test-suite request volume
triggering limits against the loopback IP.

### 3. HMAC-SHA256 Webhook Signature Verification (Step 3.3)

**Decision:** Verify all payment webhook notifications using HMAC-SHA256
with a shared secret before processing.

**Threat model:** Without verification, any party who discovers the
webhook URL can POST a fake payment notification, triggering settlement
of an invoice without any real funds arriving. This would cause the
platform to release supplier funds with no corresponding buyer payment.

**Implementation details:**
- Raw request body bytes are captured before JSON parsing using a
  custom `captureRawBody` middleware
- The global `express.json()` middleware is bypassed for the webhook
  route via `req.originalUrl.includes('/webhook/payment')`
- `crypto.timingSafeEqual` is used for signature comparison to prevent
  timing attacks where an attacker measures response time to determine
  partial signature matches
- Test environment skips verification to allow integration tests to
  call the webhook without computing real HMAC signatures

**Production deployment note:** The `WEBHOOK_SECRET` must be rotated
if compromised. Rotation requires coordination with the banking partner
and a brief dual-validation window during the transition.

### 4. HTTP Security Headers via helmet.js (Step 3.4)

**Decision:** Apply helmet.js with a strict Content Security Policy.

This API serves no HTML, scripts, or styles. The CSP is therefore
maximally restrictive: `default-src 'none'` with only `connect-src 'self'`
permitted. This eliminates the entire class of XSS-via-response-injection
attacks.

`Strict-Transport-Security` with `preload` ensures browsers enforce
HTTPS for one year even before the first connection, preventing
SSL-stripping attacks on first visit.

---

## Consequences

**Positive:**
- Webhook forgery is now physically impossible without the shared secret
- Brute-force credential attacks require 480 years at 5 attempts per
  15 minutes to exhaust a 10-character alphanumeric password space
- Duplicate invoice creation via network retry is handled transparently
- Security header compliance satisfies OWASP API Security Top 10
  requirements for items API3 (broken object property level auth),
  API4 (unrestricted resource consumption), and API8 (security misconfiguration)

**Negative:**
- DB-backed idempotency keys add one SELECT and one INSERT to every
  POST /invoices request. At expected MVP volume this is negligible;
  at scale the Redis migration should be prioritised.
- The webhook stream-handling code is more complex than a simple
  `express.json()` parse. This complexity is documented in the
  middleware file and is the necessary cost of raw-body access.