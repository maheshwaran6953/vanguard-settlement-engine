import express from 'express';
import helmet  from 'helmet';
import { apiLimiter }    from './middleware/rate-limiter';
import { requestLogger } from './middleware/request-logger';
import { errorHandler }  from './middleware/error-handler';
import { authRouter }    from './routes/auth/auth.router';
import { invoiceRouter } from './routes/invoice/invoice.router';
import { vanRouter }     from './routes/van/van.router';
import { riskRouter }    from './routes/risk/risk.router';
import { healthRouter }  from './routes/health/health.router';

export function buildApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'none'"],
        scriptSrc:      ["'none'"],
        styleSrc:       ["'none'"],
        imgSrc:         ["'none'"],
        connectSrc:     ["'self'"],
        frameAncestors: ["'none'"],
        formAction:     ["'none'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard:     { action: 'deny' },
    hidePoweredBy:  true,
    noSniff:        true,
    referrerPolicy: { policy: 'no-referrer' },
  }));

  // Apply express.json() to every route EXCEPT the webhook endpoint.
  // The webhook route uses captureRawBody instead, which must read
  // the raw stream before any JSON parsing occurs. If express.json()
  // runs first it consumes the stream and captureRawBody gets nothing.
  app.use((req, res, next) => {
    if (req.path === '/vans/webhook/payment') {
      next();
      return;
    }
    express.json()(req, res, next);
  });

  app.use(apiLimiter);
  app.use(requestLogger);

  app.use('/health',   healthRouter);
  app.use('/auth',     authRouter);
  app.use('/invoices', invoiceRouter);
  app.use('/vans',     vanRouter);
  app.use('/risk',     riskRouter);

  app.use(errorHandler);
  return app;
}