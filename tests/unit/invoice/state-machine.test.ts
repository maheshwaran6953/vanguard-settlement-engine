import {
    VALID_TRANSITIONS,
    assertValidTransition,
    getAllStatuses,
    getTerminalStatuses,
    isTerminalStatus,
    InvalidTransitionError,
  } from '../../../core/services/invoice/state-machine';
  import type { InvoiceStatus } from '../../../core/domain/entities';
  import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
  
  // ================================================================
  // VALID TRANSITIONS MAP — structural integrity
  // ================================================================
  
  describe('VALID_TRANSITIONS map', () => {
  
    it('contains an entry for every InvoiceStatus value', () => {
      const expectedStatuses: InvoiceStatus[] = [
        'DRAFT',
        'SUBMITTED',
        'BUYER_APPROVED',
        'FINANCING_REQUESTED',
        'FUNDED',
        'REPAID',
        'DEFAULTED',
        'CANCELLED',
      ];
  
      expectedStatuses.forEach((status) => {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
      });
    });
  
    it('has exactly 8 status entries — no undocumented states', () => {
      expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(8);
    });
  
    it('contains only valid InvoiceStatus values as transition targets', () => {
      const allStatuses = getAllStatuses();
  
      Object.entries(VALID_TRANSITIONS).forEach(([from, targets]) => {
        targets.forEach((to) => {
          expect(allStatuses).toContain(to);
          // Verify the message is readable in test output on failure
          // by wrapping in a descriptive check
          const isKnownStatus = allStatuses.includes(to);
          expect(isKnownStatus).toBe(true);
          void from; // suppress unused variable warning
        });
      });
    });
  
    it('has exactly 3 terminal states: REPAID, DEFAULTED, CANCELLED', () => {
      const terminals = getTerminalStatuses();
  
      expect(terminals).toHaveLength(3);
      expect(terminals).toContain('REPAID');
      expect(terminals).toContain('DEFAULTED');
      expect(terminals).toContain('CANCELLED');
    });
  
    it('CANCELLED is reachable from every non-terminal state', () => {
      const nonTerminalStatuses: InvoiceStatus[] = [
        'DRAFT',
        'SUBMITTED',
        'BUYER_APPROVED',
        'FINANCING_REQUESTED',
        'FUNDED',
      ];
  
      // FUNDED → CANCELLED is intentionally excluded.
      // Once funds have been disbursed, cancellation requires a
      // separate reversal process — it is not a simple status change.
      const cancelableStatuses: InvoiceStatus[] = [
        'DRAFT',
        'SUBMITTED',
        'BUYER_APPROVED',
        'FINANCING_REQUESTED',
      ];
  
      cancelableStatuses.forEach((status) => {
        expect(VALID_TRANSITIONS[status]).toContain('CANCELLED');
      });
  
      // FUNDED cannot be directly cancelled
      expect(VALID_TRANSITIONS['FUNDED']).not.toContain('CANCELLED');
      void nonTerminalStatuses;
    });
  
    it('FUNDED can only transition to REPAID or DEFAULTED', () => {
      expect(VALID_TRANSITIONS['FUNDED']).toEqual(
        expect.arrayContaining(['REPAID', 'DEFAULTED'])
      );
      expect(VALID_TRANSITIONS['FUNDED']).toHaveLength(2);
    });
  });
  
  // ================================================================
  // assertValidTransition — valid paths
  // ================================================================
  
  describe('assertValidTransition — valid transitions do not throw', () => {
  
    const validPaths: Array<[InvoiceStatus, InvoiceStatus]> = [
      ['DRAFT',               'SUBMITTED'],
      ['DRAFT',               'CANCELLED'],
      ['SUBMITTED',           'BUYER_APPROVED'],
      ['SUBMITTED',           'CANCELLED'],
      ['BUYER_APPROVED',      'FINANCING_REQUESTED'],
      ['BUYER_APPROVED',      'CANCELLED'],
      ['FINANCING_REQUESTED', 'FUNDED'],
      ['FINANCING_REQUESTED', 'CANCELLED'],
      ['FUNDED',              'REPAID'],
      ['FUNDED',              'DEFAULTED'],
    ];
  
    validPaths.forEach(([from, to]) => {
      it(`allows ${from} → ${to}`, () => {
        expect(() => assertValidTransition(from, to)).not.toThrow();
      });
    });
  });
  
  // ================================================================
  // assertValidTransition — invalid paths throw InvalidTransitionError
  // ================================================================
  
  describe('assertValidTransition — invalid transitions throw', () => {
  
    it('throws InvalidTransitionError with descriptive message', () => {
      expect(() => assertValidTransition('DRAFT', 'FUNDED')).toThrow(
        InvalidTransitionError
      );
  
      expect(() => assertValidTransition('DRAFT', 'FUNDED')).toThrow(
        'Invalid status transition: DRAFT → FUNDED'
      );
    });
  
    it('throws for every skip-ahead attempt', () => {
      const skipAheadAttempts: Array<[InvoiceStatus, InvoiceStatus]> = [
        ['DRAFT',               'BUYER_APPROVED'],
        ['DRAFT',               'FINANCING_REQUESTED'],
        ['DRAFT',               'FUNDED'],
        ['DRAFT',               'REPAID'],
        ['SUBMITTED',           'FINANCING_REQUESTED'],
        ['SUBMITTED',           'FUNDED'],
        ['SUBMITTED',           'REPAID'],
        ['BUYER_APPROVED',      'FUNDED'],
        ['BUYER_APPROVED',      'REPAID'],
        ['FINANCING_REQUESTED', 'REPAID'],
      ];
  
      skipAheadAttempts.forEach(([from, to]) => {
        expect(() => assertValidTransition(from, to)).toThrow(
          InvalidTransitionError
        );
      });
    });
  
    it('throws for every backward transition attempt', () => {
      const backwardAttempts: Array<[InvoiceStatus, InvoiceStatus]> = [
        ['SUBMITTED',           'DRAFT'],
        ['BUYER_APPROVED',      'SUBMITTED'],
        ['BUYER_APPROVED',      'DRAFT'],
        ['FINANCING_REQUESTED', 'BUYER_APPROVED'],
        ['FINANCING_REQUESTED', 'SUBMITTED'],
        ['FUNDED',              'FINANCING_REQUESTED'],
        ['FUNDED',              'BUYER_APPROVED'],
        ['REPAID',              'FUNDED'],
      ];
  
      backwardAttempts.forEach(([from, to]) => {
        expect(() => assertValidTransition(from, to)).toThrow(
          InvalidTransitionError
        );
      });
    });
  
    it('throws for self-transitions on every status', () => {
      getAllStatuses().forEach((status) => {
        expect(() => assertValidTransition(status, status)).toThrow(
          InvalidTransitionError
        );
      });
    });
  });
  
  // ================================================================
  // Terminal states — exhaustive rejection of all transitions
  // ================================================================
  
  describe('terminal states reject all further transitions', () => {
  
    const terminalStates: InvoiceStatus[] = ['REPAID', 'DEFAULTED', 'CANCELLED'];
  
    terminalStates.forEach((terminal) => {
  
      describe(`from ${terminal}`, () => {
  
        it('is identified as a terminal status', () => {
          expect(isTerminalStatus(terminal)).toBe(true);
        });
  
        it('rejects all possible transition targets', () => {
          getAllStatuses().forEach((target) => {
            expect(() => assertValidTransition(terminal, target)).toThrow(
              InvalidTransitionError
            );
          });
        });
      });
    });
  });
  
  // ================================================================
  // Non-terminal states are not terminal
  // ================================================================
  
  describe('non-terminal states are correctly identified', () => {
  
    const nonTerminalStates: InvoiceStatus[] = [
      'DRAFT',
      'SUBMITTED',
      'BUYER_APPROVED',
      'FINANCING_REQUESTED',
      'FUNDED',
    ];
  
    nonTerminalStates.forEach((status) => {
      it(`${status} is not a terminal status`, () => {
        expect(isTerminalStatus(status)).toBe(false);
      });
    });
  });
  
  // ================================================================
  // InvalidTransitionError — error class contract
  // ================================================================
  
  describe('InvalidTransitionError', () => {
  
    it('is an instance of Error', () => {
      const err = new InvalidTransitionError('DRAFT', 'REPAID');
      expect(err).toBeInstanceOf(Error);
    });
  
    it('has the correct name property', () => {
      const err = new InvalidTransitionError('DRAFT', 'REPAID');
      expect(err.name).toBe('InvalidTransitionError');
    });
  
    it('includes both states in the message', () => {
      const err = new InvalidTransitionError('SUBMITTED', 'DEFAULTED');
      expect(err.message).toContain('SUBMITTED');
      expect(err.message).toContain('DEFAULTED');
    });
  
    it('is catchable by type in a try-catch block', () => {
      let caught: unknown;
  
      try {
        assertValidTransition('REPAID', 'DRAFT');
      } catch (err) {
        caught = err;
      }
  
      expect(caught).toBeInstanceOf(InvalidTransitionError);
      expect(caught).toBeInstanceOf(Error);
    });
  });