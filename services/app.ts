import express          from 'express';
import helmet           from 'helmet';
import { apiLimiter }   from './middleware/rate-limiter';
import { requestLogger } from './middleware/request-logger';
import { errorHandler }  from './middleware/error-handler';
import { authRouter }    from './routes/auth/auth.router';
import { invoiceRouter } from './routes/invoice/invoice.router';
import { vanRouter }     from './routes/van/van.router';
import { riskRouter }    from './routes/risk/risk.router';
import { healthRouter }  from './routes/health/health.router';

export function buildApp() {
  const app = express();

  // ── Security headers ────────────────────────────────────────────
  // helmet() sets 14 HTTP response headers that defend against
  // common web vulnerabilities. Applied first so every response
  // — including 4xx and 5xx — carries these headers.
  //
  // Headers set automatically:
  //   Content-Security-Policy      — restricts resource loading
  //   Cross-Origin-Embedder-Policy — prevents cross-origin embedding
  //   Cross-Origin-Opener-Policy   — isolates browsing context
  //   Cross-Origin-Resource-Policy — controls cross-origin reads
  //   Origin-Agent-Cluster         — enables origin keying
  //   Referrer-Policy              — controls referrer information
  //   Strict-Transport-Security    — forces HTTPS (1 year)
  //   X-Content-Type-Options       — prevents MIME sniffing
  //   X-DNS-Prefetch-Control       — disables DNS prefetching
  //   X-Download-Options           — prevents IE file download
  //   X-Frame-Options              — prevents clickjacking (DENY)
  //   X-Permitted-Cross-Domain-Policies — restricts Adobe products
  //   X-Powered-By                 — removed (hides Express)
  //   X-XSS-Protection             — legacy XSS filter (disabled)
  //
  // CSP is configured for a pure JSON API — no scripts, no styles,
  // no frames. Any attempt to load external resources is blocked.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:  ["'none'"],    // block everything by default
          scriptSrc:   ["'none'"],    // no scripts
          styleSrc:    ["'none'"],    // no styles
          imgSrc:      ["'none'"],    // no images
          connectSrc:  ["'self'"],    // API calls to self only
          frameAncestors: ["'none'"], // no embedding in iframes
          formAction:  ["'none'"],    // no form submissions
        },
      },
      // HSTS: tell browsers to use HTTPS for 1 year.
      // includeSubDomains covers any sub-services deployed later.
      // preload allows submission to browser HSTS preload lists.
      strictTransportSecurity: {
        maxAge:            31_536_000,
        includeSubDomains: true,
        preload:           true,
      },
      // X-Frame-Options: DENY — this API should never be embedded
      // in an iframe. Prevents clickjacking against admin UIs.
      frameguard: { action: 'deny' },
      // Remove X-Powered-By: Express — reduces attack surface
      // by not advertising the framework to scanners.
      hidePoweredBy: true,
      // X-Content-Type-Options: nosniff — prevents browsers from
      // interpreting response bodies as a different MIME type.
      noSniff: true,
      // Referrer-Policy: no-referrer — financial APIs should not
      // leak the request origin to third-party services.
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // ── Parsing ─────────────────────────────────────────────────────
  app.use(express.json());

  // ── Rate limiting ────────────────────────────────────────────────
  app.use(apiLimiter);

  // ── Structured logging ───────────────────────────────────────────
  app.use(requestLogger);

  // ── Routes ──────────────────────────────────────────────────────
  app.use('/health',   healthRouter);
  app.use('/auth',     authRouter);
  app.use('/invoices', invoiceRouter);
  app.use('/vans',     vanRouter);
  app.use('/risk',     riskRouter);

  // ── Error handler — must be last ────────────────────────────────
  app.use(errorHandler);

  return app;
}