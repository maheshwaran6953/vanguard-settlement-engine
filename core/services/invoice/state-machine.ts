import { InvoiceStatus } from '../../domain/entities';

// ----------------------------------------------------------------
// Valid state transitions for the invoice lifecycle.
// This map is the single source of truth for what status changes
// are permitted. Any transition not listed here is rejected.
//
// Terminal states (REPAID, DEFAULTED, CANCELLED) have empty arrays
// — once an invoice reaches these states it cannot be moved.
// ----------------------------------------------------------------
export const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT:                ['SUBMITTED', 'CANCELLED'],
  SUBMITTED:            ['BUYER_APPROVED', 'CANCELLED'],
  BUYER_APPROVED:       ['FINANCING_REQUESTED', 'CANCELLED'],
  FINANCING_REQUESTED:  ['FUNDED', 'CANCELLED'],
  FUNDED:               ['REPAID', 'DEFAULTED'],
  REPAID:               [],
  DEFAULTED:            [],
  CANCELLED:            [],
};

export class InvalidTransitionError extends Error {
  constructor(from: InvoiceStatus, to: InvoiceStatus) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertValidTransition(
  current: InvoiceStatus,
  next:    InvoiceStatus
): void {
  const allowed = VALID_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new InvalidTransitionError(current, next);
  }
}

// ----------------------------------------------------------------
// getAllStatuses
// Returns every possible invoice status value.
// Used in tests to exhaustively verify all states are covered.
// ----------------------------------------------------------------
export function getAllStatuses(): InvoiceStatus[] {
  return Object.keys(VALID_TRANSITIONS) as InvoiceStatus[];
}

// ----------------------------------------------------------------
// getTerminalStatuses
// Returns statuses from which no further transition is possible.
// ----------------------------------------------------------------
export function getTerminalStatuses(): InvoiceStatus[] {
  return getAllStatuses().filter(
    (status) => VALID_TRANSITIONS[status].length === 0
  );
}

// ----------------------------------------------------------------
// isTerminalStatus
// Returns true if no further transition is possible from this status.
// ----------------------------------------------------------------
export function isTerminalStatus(status: InvoiceStatus): boolean {
  return (VALID_TRANSITIONS[status] ?? []).length === 0;
}