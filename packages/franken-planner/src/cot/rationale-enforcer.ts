import type { Task, RationaleBlock } from '../core/types.js';
import { now as deterministicNow } from '@franken/types';

/**
 * Generates a RationaleBlock from a Task.
 * In a full system this would be populated by an LLM performing CoT reasoning.
 * Here it derives deterministic rationale from the task's objective field.
 */
export class RationaleEnforcer {
  private approvalSessionTokenId: string | undefined;

  generate(task: Task): RationaleBlock {
    const base = {
      taskId: task.id,
      reasoning: `Executing task: ${task.objective}`,
      expectedOutcome: `Task '${task.id}' completes successfully`,
      timestamp: new Date(deterministicNow()),
    };

    const withSessionToken = this.approvalSessionTokenId !== undefined
      ? { ...base, approvalSessionTokenId: this.approvalSessionTokenId }
      : base;

    const tool = task.metadata?.['tool'];
    if (typeof tool === 'string') {
      return { ...withSessionToken, selectedTool: tool };
    }
    return withSessionToken;
  }

  rememberApprovalSessionToken(tokenId: string): void {
    this.approvalSessionTokenId = tokenId;
  }
}
