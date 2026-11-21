import { Router, Request, Response, NextFunction } from 'express';
import { orgRepository } from '../../../core/database/container';
import { authenticate } from '../../middleware/authenticate';
import { z } from 'zod';

export const organisationRouter = Router();

const GetOrganisationsQuerySchema = z.object({
  role: z.enum(['buyer', 'supplier', 'platform']).default('buyer'),
});

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /organisations?role=buyer
// Returns id and legal_name only. Never returns credentials or password hashes.
organisationRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const query = GetOrganisationsQuerySchema.parse(req.query);
    const orgs = await orgRepository.findByRole(query.role);
    res.status(200).json({ success: true, data: orgs });
  })
);
