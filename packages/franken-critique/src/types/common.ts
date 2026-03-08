// Shared types re-exported from @franken/types
export type { TaskId } from '@franken/types';
export { createTaskId } from '@franken/types';
export type { Verdict } from '@franken/types';
export type { CritiqueSeverity as Severity } from '@franken/types';

/**
 * Normalized score between 0 and 1.
 * 0 = worst, 1 = best.
 */
export type Score = number;

/** Unique identifier for a critique session. */
export type SessionId = string;
