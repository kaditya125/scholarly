/**
 * Content Pipeline State Machine
 * Enforces valid state transitions and lifecycle safety.
 */

import { ProcessingState } from './types';

/**
 * Transition Table defining valid state transitions for ContentSource
 */
export const VALID_TRANSITIONS: Record<ProcessingState, readonly ProcessingState[]> = {
  DRAFT: ['UPLOADING', 'QUEUED', 'CANCELLED', 'ARCHIVED'],
  UPLOADING: ['QUEUED', 'FAILED', 'CANCELLED'],
  QUEUED: ['PROCESSING', 'CANCELLED', 'FAILED'],
  PROCESSING: ['READY', 'FAILED', 'CANCELLED'],
  READY: ['PROCESSING', 'ARCHIVED', 'FAILED'],
  FAILED: ['QUEUED', 'ARCHIVED', 'CANCELLED'],
  CANCELLED: ['QUEUED', 'ARCHIVED', 'DRAFT'],
  ARCHIVED: ['DRAFT', 'QUEUED'],
};

export class InvalidStateTransitionError extends Error {
  public readonly fromState: ProcessingState;
  public readonly toState: ProcessingState;

  constructor(fromState: ProcessingState, toState: ProcessingState, message?: string) {
    const detail = message ? `: ${message}` : '';
    super(`Invalid ContentSource state transition from "${fromState}" to "${toState}"${detail}`);
    this.name = 'InvalidStateTransitionError';
    this.fromState = fromState;
    this.toState = toState;
  }
}

/**
 * Checks whether a transition between two states is allowed.
 */
export function canTransition(from: ProcessingState, to: ProcessingState): boolean {
  if (from === to) return true; // Idempotent same-state transition
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Asserts that a state transition is allowed; throws InvalidStateTransitionError if not.
 */
export function assertValidTransition(from: ProcessingState, to: ProcessingState, message?: string): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to, message);
  }
}

/**
 * Returns true if the state is considered ready for downstream consumption.
 */
export function isReadyState(state: ProcessingState): boolean {
  return state === 'READY';
}

/**
 * Returns true if the state is in a terminal error or cancelled state.
 */
export function isTerminalFailureState(state: ProcessingState): boolean {
  return state === 'FAILED' || state === 'CANCELLED';
}

/**
 * Returns all valid next states from the given state.
 */
export function getAllowedNextStates(state: ProcessingState): readonly ProcessingState[] {
  return VALID_TRANSITIONS[state] || [];
}
