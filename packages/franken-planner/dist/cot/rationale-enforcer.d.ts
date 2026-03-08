import type { Task, RationaleBlock } from '../core/types.js';
/**
 * Generates a RationaleBlock from a Task.
 * In a full system this would be populated by an LLM performing CoT reasoning.
 * Here it derives deterministic rationale from the task's objective field.
 */
export declare class RationaleEnforcer {
    generate(task: Task): RationaleBlock;
}
//# sourceMappingURL=rationale-enforcer.d.ts.map