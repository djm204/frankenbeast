import { createTaskId } from '../core/types.js';
import type { TaskId, KnownError } from '../core/types.js';
import type { PlanGraph } from '../core/dag.js';
import { insertFixItTask } from './fix-it-injector.js';

/**
 * Generates a recovery plan by injecting a fix-it task before the failed task.
 * Uses the recovery-domain fix-it injector so the fix inherits the failed task's dependencies
 * and the failed task becomes dependent on the fix (ADR-007).
 */
export class RecoveryPlanGenerator {
  generate(failedTaskId: TaskId, knownError: KnownError, graph: PlanGraph, attempt: number): PlanGraph {
    const fixTask = {
      id: createTaskId(`fix-${failedTaskId}-attempt-${attempt}`),
      objective: knownError.fixSuggestion,
      requiredSkills: [] as string[],
      dependsOn: [] as TaskId[],
      status: 'pending' as const,
    };
    return insertFixItTask(graph, failedTaskId, fixTask);
  }
}
