import { Router, Request, Response, NextFunction } from 'express';
import { vanService } from '../../../core/database/container';
import { CreateVanSchema, RecordPaymentSchema } from './van.schemas';
import { DuplicatePaymentError } from '../../../core/services/van.service';
import { authenticate, requireRole } from '../../middleware/authenticate';

export const vanRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /vans — Restricted to Suppliers or Admins
vanRouter.post(
  '/',
  authenticate,
  requireRole('supplier', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const body = CreateVanSchema.parse(req.body);
    const van = await vanService.createVan(body);
    res.status(201).json({ success: true, data: van });
  })
);

// GET /vans/:invoiceId — Any authenticated user can check status
vanRouter.get(
  '/:invoiceId',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await vanService.getVanDetails(req.params.invoiceId as string);
    res.status(200).json({ success: true, data: result });
  })
);

// POST /vans/webhook/payment — OPEN (IP-authenticated in prod)
vanRouter.post(
  '/webhook/payment',
  asyncHandler(async (req, res) => {
    const body = RecordPaymentSchema.parse(req.body);
    try {
      const result = await vanService.recordPayment(body);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof DuplicatePaymentError) {
        res.status(200).json({ success: true, message: 'Payment already recorded' });
        return;
      }
      throw err;
    }
  })
);