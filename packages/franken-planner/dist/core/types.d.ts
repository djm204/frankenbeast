import type { TaskId } from '@franken/types';
export type { TaskId };
export { createTaskId } from '@franken/types';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export interface Task {
    id: TaskId;
    objective: string;
    requiredSkills: string[];
    dependsOn: TaskId[];
    status: TaskStatus;
    metadata?: Record<string, unknown>;
}
export type PlanningStrategyName = 'linear' | 'parallel' | 'recursive';
/** Task completed successfully, no expansion. */
export interface TaskResultSuccess {
    status: 'success';
    taskId: TaskId;
    output?: unknown;
    expand?: false;
}
/** Task completed and signals the recursive planner to expand with new tasks. */
export interface TaskResultExpand {
    status: 'success';
    taskId: TaskId;
    output?: unknown;
    expand: true;
    newTasks: Task[];
}
/** Task failed with an error. */
export interface TaskResultFailure {
    status: 'failure';
    taskId: TaskId;
    error: Error;
}
export type TaskResult = TaskResultSuccess | TaskResultExpand | TaskResultFailure;
export type PlanResult = {
    status: 'completed';
    taskResults: TaskResult[];
} | {
    status: 'failed';
    taskResults: TaskResult[];
    failedTaskId: TaskId;
    error: Error;
} | {
    status: 'aborted';
    reason: string;
} | {
    status: 'rationale_rejected';
    taskId: TaskId;
};
export interface Intent {
    goal: string;
    strategy?: PlanningStrategyName;
    context?: Record<string, unknown>;
}
export type { RationaleBlock, VerificationResult } from '@franken/types';
export type ADRStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';
export interface ADR {
    id: string;
    title: string;
    status: ADRStatus;
    decision: string;
}
/** A known error pattern with a suggested fix, stored in MOD-03 episodic memory. */
export interface KnownError {
    pattern: string;
    description: string;
    fixSuggestion: string;
}
export interface ProjectContext {
    projectName: string;
    adrs: ADR[];
    rules: string[];
}
//# sourceMappingURL=types.d.ts.map