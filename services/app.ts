import express               from 'express';
import { checkDbConnection } from '../core/database/pool';
import { env }               from '../core/config/env';
import { invoiceRouter }     from './routes/invoice/invoice.router';
import { healthRouter }      from './routes/health/health.router';
import { errorHandler }      from './middleware/error-handler';
import { vanRouter } from './routes/van/van.router';
import { riskRouter } from './routes/risk/risk.router';

const app = express();

// ------------------------------------------------------------------
// Global middleware
// ------------------------------------------------------------------
app.use(express.json());           // parse JSON request bodies

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
app.use('/health',   healthRouter);
app.use('/invoices', invoiceRouter);

// ------------------------------------------------------------------
// Error handler — must be registered LAST, after all routes
// ------------------------------------------------------------------
app.use(errorHandler);

app.use('/vans', vanRouter);

app.use('/risk', riskRouter);

// ------------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------------
async function bootstrap(): Promise<void> {
  console.log(`🚀 Starting ${env.APP_NAME} in ${env.NODE_ENV} mode`);
  await checkDbConnection();

  app.listen(env.PORT, () => {
    console.log(`✅ Server listening on port ${env.PORT}`);
    console.log(`   Health: http://localhost:${env.PORT}/health`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});