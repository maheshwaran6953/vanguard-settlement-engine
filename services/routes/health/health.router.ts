import { Router }  from 'express';
import { pool }    from '../../../core/database/pool';

export const healthRouter = Router();

// GET /health
// Used by Docker, Kubernetes, and load balancers to verify
// the service is alive AND the DB connection is healthy.
// Returns 200 only if both are true.
healthRouter.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status:    'ok',
      service:   'vanguard-settlement-engine',
      db:        'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status:  'degraded',
      db:      'disconnected',
    });
  }
});