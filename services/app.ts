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
import { adminRouter }   from './routes/admin/admin.router';
import swaggerUi  from 'swagger-ui-express';
import jsYaml     from 'js-yaml';
import fs         from 'fs';
import path       from 'path';

export function buildApp() {
  const app = express();
  const isDev = process.env['NODE_ENV'] !== 'production';
  
  if (process.env['NODE_ENV'] !== 'production') {
    try {
      const specPath = path.resolve(__dirname, '../docs/openapi.yaml');
      const specFile = fs.readFileSync(specPath, 'utf8');
      const swaggerSpec = jsYaml.load(specFile) as object;
  
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customSiteTitle: 'Vanguard Settlement Engine API',
        customCss: '.swagger-ui .topbar { display: none }',
      }));
  
      console.log('📖 Swagger UI available at http://localhost:3000/docs');
    } catch (err) {
      console.warn('Could not load OpenAPI spec:', err);
    }
  }

  app.use(helmet({
    contentSecurityPolicy: isDev ? false : { // Disable CSP in dev or add Swagger exceptions
      directives: {
        defaultSrc:     ["'none'"],
        scriptSrc:      ["'self'"], 
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", "data:"],
        connectSrc:     ["'self'"],
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

  app.use('/api/v1/auth', authRouter);
  app.use('/health',   healthRouter);
  app.use('/auth',     authRouter);
  app.use('/invoices', invoiceRouter);
  app.use('/vans',     vanRouter);
  app.use('/risk',     riskRouter);
  app.use('/admin', adminRouter);

  app.use(errorHandler);
  return app;
}