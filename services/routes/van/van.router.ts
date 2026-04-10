import { Router, Request, Response, NextFunction } from 'express';
import { vanService }            from '../../../core/database/container';
import { invoiceService }        from '../../../core/database/container';
import { CreateVanSchema, RecordPaymentSchema } from './van.schemas';
import {
  DuplicatePaymentError,
  VanNotFoundError,
} from '../../../core/services/van.service';
import { authenticate, requireRole }
  from '../../middleware/authenticate';
import {
  captureRawBody,
  verifyWebhookSignature,
} from '../../middleware/webhook-auth';

export const vanRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /vans — create VAN for a FINANCING_REQUESTED invoice
vanRouter.post(
  '/',
  authenticate,
  requireRole('supplier', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const body = CreateVanSchema.parse(req.body);
    const van  = await vanService.createVan(body);
    res.status(201).json({ success: true, data: van });
  })
);

// POST /vans/webhook/payment
// Bank payment notification — secured with HMAC signature.
//
// Middleware chain:
//   captureRawBody        → buffers raw bytes before parsing
//   verifyWebhookSignature → validates HMAC-SHA256 signature
//   handler               → processes the payment
//
// Note: captureRawBody replaces express.json() for this route.
// The global express.json() in app.ts does not run for this path
// because express.json() only fires if the body has not already
// been consumed — captureRawBody consumes the stream first.
vanRouter.post(
  '/webhook/payment',
  captureRawBody,
  verifyWebhookSignature,
  asyncHandler(async (req, res) => {
    const body = RecordPaymentSchema.parse(req.body);

    try {
      const result = await vanService.recordPayment(body);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof DuplicatePaymentError) {
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

// GET /vans/:invoiceId — reconciliation view
vanRouter.get(
  '/:invoiceId',
  authenticate,
  asyncHandler(async (req, res) => {
    const invoiceId = req.params.invoiceId as string;
    const result = await vanService.getVanDetails(
      invoiceId.trim()
    );
    res.status(200).json({ success: true, data: result });
  })
);