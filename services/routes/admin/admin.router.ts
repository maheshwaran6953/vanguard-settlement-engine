import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole }
  from '../../middleware/authenticate';
import {
  getAllFailedJobs,
  retryFailedJob,
  discardFailedJob,
} from '../../../infra/queue/failed-jobs.repository';

export const adminRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// All admin routes require platform_admin role.
// Apply authenticate + requireRole to the router level so every
// route beneath is protected without repeating the middleware.
adminRouter.use(authenticate);
adminRouter.use(requireRole('platform_admin'));

// ----------------------------------------------------------------
// GET /admin/failed-jobs
// Returns all failed jobs across all queues.
// Used by the operations team to monitor queue health.
// ----------------------------------------------------------------
adminRouter.get(
  '/failed-jobs',
  asyncHandler(async (_req, res) => {
    const jobs = await getAllFailedJobs();
    res.status(200).json({
      success: true,
      data: {
        count: jobs.length,
        jobs,
      },
    });
  })
);

// ----------------------------------------------------------------
// POST /admin/failed-jobs/:queue/:jobId/retry
// Moves a specific failed job back to waiting.
// ----------------------------------------------------------------
adminRouter.post(
    '/failed-jobs/:queue/:jobId/retry',
    asyncHandler(async (req, res) => {
      const { queue, jobId } = req.params;
      // We cast to string to satisfy the repository's parameter type
      await retryFailedJob(queue as string, jobId as string);
      res.status(200).json({
        success: true,
        message: `Job ${jobId} in queue ${queue} queued for retry`,
      });
    })
  );

// ----------------------------------------------------------------
// DELETE /admin/failed-jobs/:queue/:jobId
// Permanently removes a failed job.
// ----------------------------------------------------------------
adminRouter.delete(
    '/failed-jobs/:queue/:jobId',
    asyncHandler(async (req, res) => {
      const { queue, jobId } = req.params;
      // We cast to string to satisfy the repository's parameter type
      await discardFailedJob(queue as string, jobId as string);
      res.status(200).json({
        success: true,
        message: `Job ${jobId} discarded from queue ${queue}`,
      });
    })
  );