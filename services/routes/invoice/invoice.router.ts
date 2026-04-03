import { Router, Request, Response, NextFunction } from 'express';
import { invoiceService }        from '../../../core/database/container';
import {
  SubmitInvoiceSchema,
  ApproveInvoiceSchema,
  RequestFinancingSchema,
} from './invoice.schemas';

export const invoiceRouter = Router();

// ------------------------------------------------------------------
// Utility: wraps async route handlers so thrown errors
// are forwarded to the Express error handler automatically.
// Without this, unhandled promise rejections crash the process.
// ------------------------------------------------------------------
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ------------------------------------------------------------------
// POST /invoices
// Submit a new invoice. Actor is the supplier.
// ------------------------------------------------------------------
invoiceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = SubmitInvoiceSchema.parse(req.body);

    // In Step 7 (Auth), actorId will come from req.user.id (JWT).
    // For now we derive it from the request body.
    const actorId = body.supplier_id;

    const invoice = await invoiceService.submitInvoice(body, actorId);

    res.status(201).json({ success: true, data: invoice });
  })
);

// ------------------------------------------------------------------
// GET /invoices/:id
// Fetch invoice with full audit trail.
// ------------------------------------------------------------------
invoiceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string; // Force cast to string
    const result = await invoiceService.getInvoiceHistory(id);

    res.status(200).json({ success: true, data: result });
  })
);

// ------------------------------------------------------------------
// POST /invoices/:id/approve
// Buyer digitally approves the invoice.
// ------------------------------------------------------------------
invoiceRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const body = ApproveInvoiceSchema.parse(req.body);

    const invoice = await invoiceService.approveInvoice(
    { invoice_id: id, ...body },
    body.buyer_id
    );

    res.status(200).json({ success: true, data: invoice });
  })
  
);

// ------------------------------------------------------------------
// POST /invoices/:id/request-financing
// Supplier requests working capital advance.
// ------------------------------------------------------------------
invoiceRouter.post(
  '/:id/request-financing',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const body = RequestFinancingSchema.parse(req.body);
    const invoice = await invoiceService.requestFinancing(
    { invoice_id: id, supplier_id: body.supplier_id },
    body.supplier_id
    );

    res.status(200).json({ success: true, data: invoice });
  })
);