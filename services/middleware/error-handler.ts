import { Request, Response, NextFunction } from 'express';
import { ZodError }                        from 'zod';

// --- Invoice Service errors ---
import {
  InvoiceNotFoundError,
  UnauthorisedActorError,
  InvalidTransitionError,
} from '../../core/services/invoice.service';

// --- Risk Service errors ---
import {
  InvoiceNotEligibleError,
} from '../../core/services/risk/risk.service';
import { createLogger } from '../../core/utils/logger';

const log = createLogger('ErrorHandler');

// Every error in this system flows through here.
// The shape of every error response is identical — callers
// can always expect { success: false, error: { code, message } }

// --- VAN Service errors ---
import {
  VanNotFoundError,
  VanAlreadyExistsError,
  DuplicatePaymentError,
} from '../../core/services/van.service';

// --- Auth Service errors ---
import {
  InvalidCredentialsError,
  AccountInactiveError,
} from '../../core/services/auth.service';

// ----------------------------------------------------------------
// Canonical error response shape.
// Every error this API returns has this structure — no exceptions.
// Clients can always destructure { success, error: { code, message } }
// ----------------------------------------------------------------
interface ErrorResponse {
  success: false;
  error: {
    code:     string;
    message:  string;
    details?: unknown;
  };
}

function send(
  res:     Response,
  status:  number,
  code:    string,
  message: string,
  details?: unknown
): void {
  const body: ErrorResponse = {
    success: false,
    error:   { code, message, ...(details ? { details } : {}) },
  };
  res.status(status).json(body);
}

// ----------------------------------------------------------------
// errorHandler
// Must be registered as the LAST middleware in app.ts.
// Express identifies a 4-argument middleware as an error handler.
// ----------------------------------------------------------------
export function errorHandler(
  err:  unknown,
  req:  Request,
  res:  Response,
  // next is required in the signature even if unused —
  // Express will not treat this as an error handler without it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {

  // --- 400: Zod validation failure ---
  // Malformed or missing fields in the request body.
  if (err instanceof InvalidCredentialsError) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: err.message },
    });
    return;
  }

  if (err instanceof AccountInactiveError) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: err.message },
    });
    return;
  }

  // --- Zod validation failure (malformed request body) ---
  if (err instanceof ZodError) {
    send(res, 400, 'VALIDATION_ERROR',
      'Request body failed validation',
      err.flatten().fieldErrors
    );
    return;
  }

  // --- 400: Known business rule violations (bad input) ---
  if (err instanceof InvalidTransitionError) {
    // 409 Conflict — the resource exists but cannot accept
    // this operation in its current state.
    send(res, 409, 'INVALID_TRANSITION', err.message);
    return;
  }

  if (err instanceof InvoiceNotEligibleError) {
    send(res, 409, 'INVOICE_NOT_ELIGIBLE', err.message);
    return;
  }

  if (err instanceof VanAlreadyExistsError) {
    send(res, 409, 'VAN_ALREADY_EXISTS', err.message);
    return;
  }

  // --- 401: Authentication failures ---
  if (err instanceof InvalidCredentialsError) {
    // Deliberately vague message — do not confirm whether
    // the email exists. Prevents user enumeration.
    send(res, 401, 'INVALID_CREDENTIALS', err.message);
    return;
  }

  if (err instanceof AccountInactiveError) {
    send(res, 401, 'ACCOUNT_INACTIVE', err.message);
    return;
  }

  // --- 403: Authorisation failures ---
  if (err instanceof UnauthorisedActorError) {
    send(res, 403, 'FORBIDDEN', err.message);
    return;
  }

  // --- 404: Resource not found ---
  if (err instanceof InvoiceNotFoundError) {
    send(res, 404, 'INVOICE_NOT_FOUND', err.message);
    return;
  }

  if (err instanceof VanNotFoundError) {
    send(res, 404, 'VAN_NOT_FOUND', err.message);
    return;
  }

  // --- 200 path: duplicate payment is handled in the router,
  // not here. DuplicatePaymentError should never reach this
  // handler — but if it does (e.g. from an unexpected call
  // site), treat it as a 409 rather than a 500.
  if (err instanceof DuplicatePaymentError) {
    send(res, 409, 'DUPLICATE_PAYMENT', err.message);
    return;
  }

  // --- 400: Generic known Error with a business message ---
  // Covers throws like `new Error('Invoice number already exists')`
  // that are not typed custom classes.
  if (err instanceof Error) {
    send(res, 400, 'BAD_REQUEST', err.message);
    return;
  }

  // --- 500: Truly unexpected — never leak internals ---
  console.error('[errorHandler] Unhandled error:', err);
  send(res, 500, 'INTERNAL_ERROR',
    'An unexpected error occurred. Please try again.'
  );
}