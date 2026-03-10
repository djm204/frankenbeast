// Shared types re-exported from @franken/core
export type { TaskId } from '@franken/core';
export { createTaskId } from '@franken/core';
export type { Verdict } from '@franken/core';
export type { CritiqueSeverity as Severity } from '@franken/core';

/**
 * Normalized score between 0 and 1.
 * 0 = worst, 1 = best.
 */
export type Score = number;

/** Unique identifier for a critique session. */
export type SessionId = string;
