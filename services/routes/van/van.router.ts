import { Router, Request, Response, NextFunction } from 'express';
import { vanService }        from '../../../core/database/container';
import { invoiceService }    from '../../../core/database/container';
import { CreateVanSchema, RecordPaymentSchema } from './van.schemas';
import {
  DuplicatePaymentError,
  VanNotFoundError,
} from '../../../core/services/van.service';

export const vanRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /vans
// Create a VAN for a FINANCING_REQUESTED invoice.
vanRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateVanSchema.parse(req.body);
    const van  = await vanService.createVan(body);
    res.status(201).json({ success: true, data: van });
  })
);

// POST /vans/webhook/payment
// Simulates a bank webhook — buyer's payment has arrived.
// In production this endpoint is called by your banking partner,
// not by your own frontend. It should be IP-whitelisted.
vanRouter.post(
  '/webhook/payment',
  asyncHandler(async (req, res) => {
    const body = RecordPaymentSchema.parse(req.body);

    try {
      const result = await vanService.recordPayment(body);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof DuplicatePaymentError) {
        // 200 on duplicate — the payment was already processed.
        // Returning 200 prevents the bank from retrying indefinitely.
        res.status(200).json({
          success: true,
          message: 'Payment already recorded',
        });
        return;
      }
      throw err;
    }
  })
);

// GET /vans/:invoiceId
// Fetch VAN state and ledger for an invoice.
vanRouter.get(
  '/:invoiceId',
  asyncHandler(async (req, res) => {
    const invoiceId = req.params.invoiceId as string;
    const result = await vanService.getVanDetails(invoiceId);
    res.status(200).json({ success: true, data: result });
  })
);