import { Request, Response, NextFunction } from 'express';
import { ZodError }                        from 'zod';

import {
  InvoiceNotFoundError,
  UnauthorisedActorError,
  InvalidCounterpartyError,
} from '../../core/services/invoice.service';

import { InvalidTransitionError }
  from '../../core/services/invoice/state-machine';

import { InvoiceNotEligibleError }
  from '../../core/services/risk/risk.service';

import {
  VanNotFoundError,
  VanAlreadyExistsError,
  DuplicatePaymentError,
} from '../../core/services/van.service';

import {
  InvalidCredentialsError,
  AccountInactiveError,
} from '../../core/services/auth.service';

interface ErrorResponse {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

function send(
  res:      Response,
  status:   number,
  code:     string,
  message:  string,
  details?: unknown
): void {
  const body: ErrorResponse = {
    success: false,
    error:   { code, message, ...(details ? { details } : {}) },
  };
  res.status(status).json(body);
}

export function errorHandler(
  err:   unknown,
  req:   Request,
  res:   Response,
  _next: NextFunction
): void {

  if (err instanceof ZodError) {
    send(res, 400, 'VALIDATION_ERROR',
      'Request body failed validation',
      err.flatten().fieldErrors
    );
    return;
  }

  if (err instanceof InvalidTransitionError) {
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

  if (err instanceof InvalidCredentialsError) {
    send(res, 401, 'UNAUTHORIZED', err.message);
    return;
  }

  if (err instanceof AccountInactiveError) {
    send(res, 401, 'ACCOUNT_INACTIVE', err.message);
    return;
  }

  if (err instanceof InvalidCounterpartyError) {
    send(res, 400, 'INVALID_COUNTERPARTY', err.message);
    return;
  }

  if (err instanceof UnauthorisedActorError) {
    send(res, 403, 'FORBIDDEN', err.message);
    return;
  }

  if (err instanceof InvoiceNotFoundError) {
    send(res, 404, 'INVOICE_NOT_FOUND', err.message);
    return;
  }

  if (err instanceof VanNotFoundError) {
    send(res, 404, 'VAN_NOT_FOUND', err.message);
    return;
  }

  if (err instanceof DuplicatePaymentError) {
    send(res, 409, 'DUPLICATE_PAYMENT', err.message);
    return;
  }

  if (
    (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '22P02') ||
    (typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string' && (err as { code: string }).code.startsWith('22')) ||
    (err instanceof Error && err.message.includes('invalid input syntax'))
  ) {
    send(res, 400, 'INVALID_INPUT', 'Invalid input syntax for parameter');
    return;
  }

  if (err instanceof Error) {
    send(res, 400, 'BAD_REQUEST', err.message);
    return;
  }

  console.error('[errorHandler] Unhandled error:', err);
  send(res, 500, 'INTERNAL_ERROR',
    'An unexpected error occurred. Please try again.'
  );
}