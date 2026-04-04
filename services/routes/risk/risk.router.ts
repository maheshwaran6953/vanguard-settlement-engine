import { Router, Request, Response, NextFunction } from 'express';
import { riskService }    from '../../../core/database/container';
import { AssessRiskSchema } from './risk.schemas';

export const riskRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /risk/assess
// Runs the three-layer risk assessment on a FINANCING_REQUESTED invoice.
riskRouter.post(
  '/assess',
  asyncHandler(async (req, res) => {
    const body   = AssessRiskSchema.parse(req.body);
    const result = await riskService.assessAndRecord(
      body,
      body.invoice_id   // actorId — replaced with JWT subject in Step 8
    );

    const statusCode = result.decision === 'APPROVE' ? 200
                     : result.decision === 'MANUAL_REVIEW' ? 202
                     : 422;

    res.status(statusCode).json({ success: true, data: result });
  })
);