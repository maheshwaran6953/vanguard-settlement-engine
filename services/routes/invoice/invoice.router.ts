import { Router, Request, Response, NextFunction } from 'express';
import { invoiceService } from '../../../core/database/container';
import {
  SubmitInvoiceSchema,
  ApproveInvoiceSchema,
} from './invoice.schemas';
import { authenticate, requireRole } from '../../middleware/authenticate';

export const invoiceRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /invoices — Only suppliers can submit
invoiceRouter.post(
  '/',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const body = SubmitInvoiceSchema.parse(req.body);
    const actorId = req.user!.sub; // ID comes from verified JWT

    const invoice = await invoiceService.submitInvoice(
      { ...body, supplier_id: actorId },
      actorId
    );
    res.status(201).json({ success: true, data: invoice });
  })
);

// GET /invoices/:id — Requires authentication
invoiceRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await invoiceService.getInvoiceHistory(req.params.id as string);
    res.status(200).json({ success: true, data: result });
  })
);

// POST /invoices/:id/approve — Only buyers
invoiceRouter.post(
  '/:id/approve',
  authenticate,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const body = ApproveInvoiceSchema.parse(req.body);
    const actorId = req.user!.sub;

    const invoice = await invoiceService.approveInvoice(
      { 
        invoice_id: req.params.id as string, 
        buyer_id: actorId, 
        buyer_signature: body.buyer_signature 
      },
      actorId
    );
    res.status(200).json({ success: true, data: invoice });
  })
);

// POST /invoices/:id/request-financing — Only suppliers
invoiceRouter.post(
  '/:id/request-financing',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const actorId = req.user!.sub;

    const invoice = await invoiceService.requestFinancing(
      { invoice_id: req.params.id as string, supplier_id: actorId },
      actorId
    );
    res.status(200).json({ success: true, data: invoice });
  })
);