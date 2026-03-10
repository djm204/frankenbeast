import type { Task, RationaleBlock } from '../core/types.js';

/**
 * Generates a RationaleBlock from a Task.
 * In a full system this would be populated by an LLM performing CoT reasoning.
 * Here it derives deterministic rationale from the task's objective field.
 */
export class RationaleEnforcer {
  generate(task: Task): RationaleBlock {
    const base = {
      taskId: task.id,
      reasoning: `Executing task: ${task.objective}`,
      expectedOutcome: `Task '${task.id}' completes successfully`,
      timestamp: new Date(),
    };

    const tool = task.metadata?.['tool'];
    if (typeof tool === 'string') {
      return { ...base, selectedTool: tool };
    }
    return base;
  }
}
