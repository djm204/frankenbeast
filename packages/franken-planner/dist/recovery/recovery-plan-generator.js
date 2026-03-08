import { createTaskId } from '../core/types.js';
/**
 * Generates a recovery plan by injecting a fix-it task before the failed task.
 * Uses PlanGraph.insertFixItTask so the fix inherits the failed task's dependencies
 * and the failed task becomes dependent on the fix (ADR-007).
 */
export class RecoveryPlanGenerator {
    generate(failedTaskId, knownError, graph, attempt) {
        const fixTask = {
            id: createTaskId(`fix-${failedTaskId}-attempt-${attempt}`),
            objective: knownError.fixSuggestion,
            requiredSkills: [],
            dependsOn: [],
            status: 'pending',
        };
        return graph.insertFixItTask(failedTaskId, fixTask);
    }
}
//# sourceMappingURL=recovery-plan-generator.js.map