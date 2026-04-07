import express            from 'express';
import { requestLogger }  from './middleware/request-logger';
import { errorHandler }   from './middleware/error-handler';
import { authRouter }     from './routes/auth/auth.router';
import { invoiceRouter }  from './routes/invoice/invoice.router';
import { vanRouter }      from './routes/van/van.router';
import { riskRouter }     from './routes/risk/risk.router';
import { healthRouter }   from './routes/health/health.router';
import { apiLimiter } from './middleware/rate-limiter';

export function buildApp() {
  const app = express();

  // ── Global middleware ──────────────────────────────────────────
  app.use(express.json());
  app.use(apiLimiter);
  app.use(requestLogger);        // structured HTTP logging

  // ── Routes ────────────────────────────────────────────────────
  app.use('/health',   healthRouter);
  app.use('/auth',     authRouter);
  app.use('/invoices', invoiceRouter);
  app.use('/vans',     vanRouter);
  app.use('/risk',     riskRouter);

  // ── Error handler — always last ───────────────────────────────
  app.use(errorHandler);

  return app;
}