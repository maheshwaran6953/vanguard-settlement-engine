import { Request, Response, NextFunction } from 'express';
import { ZodError }                        from 'zod';
import {
  InvoiceNotFoundError,
  UnauthorisedActorError,
  InvalidTransitionError,
} from '../../core/services/invoice.service';
import { InvoiceNotEligibleError } from '../../core/services/risk/risk.service';

// Every error in this system flows through here.
// The shape of every error response is identical — callers
// can always expect { success: false, error: { code, message } }

interface ErrorResponse {
  success: false;
  error: {
    code:    string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  err:  unknown,
  req:  Request,
  res:  Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {

  // --- Zod validation failure (malformed request body) ---
  if (err instanceof ZodError) {
    const body: ErrorResponse = {
      success: false,
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Request body failed validation',
        details: err.flatten().fieldErrors,
      },
    };
    res.status(400).json(body);
    return;
  }

  // --- Business rule violations ---
  if (err instanceof InvoiceNotFoundError) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: err.message },
    });
    return;
  }

  if (err instanceof UnauthorisedActorError) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: err.message },
    });
    return;
  }

  if (err instanceof InvalidTransitionError) {
    res.status(409).json({
      success: false,
      error: { code: 'INVALID_TRANSITION', message: err.message },
    });
    return;
  }

  // --- Known business errors (e.g. duplicate invoice number) ---
  if (err instanceof Error) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: err.message },
    });
    return;
  }
  
  if (err instanceof InvoiceNotEligibleError) {
    res.status(409).json({
      success: false,
      error: { code: 'INVALID_TRANSITION', message: err.message },
    });
    return;
  }

  // --- Unexpected system error ---
  // Never leak internal details to the caller in production.
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code:    'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}