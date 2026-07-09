// Shared types re-exported from @franken/types
export type { SessionId, TaskId } from '@franken/types';
export { createSessionId, createTaskId } from '@franken/types';
export type { Verdict } from '@franken/types';
export type { CritiqueSeverity as Severity } from '@franken/types';

/**
 * Normalized score between 0 and 1.
 * 0 = worst, 1 = best.
 */
export type Score = number;

// SessionId is intentionally the branded @franken/types SessionId.
