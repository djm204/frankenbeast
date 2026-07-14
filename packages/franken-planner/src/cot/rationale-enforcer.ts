import type { Task, RationaleBlock } from '../core/types.js';
import { now as deterministicNow } from '@franken/types';

/**
 * Generates a RationaleBlock from a Task.
 * In a full system this would be populated by an LLM performing CoT reasoning.
 * Here it derives deterministic rationale from the task's objective field.
 */
export class RationaleEnforcer {
  private readonly approvalSessionTokenIdsByScope = new Map<string, string[]>();
  private approvalSessionTokenIds: string[] = [];

  generate(task: Task): RationaleBlock {
    const base = {
      taskId: task.id,
      reasoning: `Executing task: ${task.objective}`,
      expectedOutcome: `Task '${task.id}' completes successfully`,
      timestamp: new Date(deterministicNow()),
    };

    const tool = task.metadata?.['tool'];
    const scopeKey = this.scopeKeyForTask(task);

    const scopedTokenIds = this.approvalSessionTokenIdsByScope.get(scopeKey) ?? [];
    const approvalSessionTokenIds = [
      ...scopedTokenIds,
      ...this.approvalSessionTokenIds.filter((tokenId) => !scopedTokenIds.includes(tokenId)),
    ];
    const approvalSessionTokenId = approvalSessionTokenIds[0];
    const withSessionToken = approvalSessionTokenId !== undefined
      ? { ...base, approvalSessionTokenId, approvalSessionTokenIds }
      : base;

    if (typeof tool === 'string') {
      return { ...withSessionToken, selectedTool: tool };
    }
    return withSessionToken;
  }

  rememberApprovalSessionToken(tokenId: string, task?: Task, triggerId?: string): void {
    const scopeKey = task !== undefined ? this.scopeKeyForTask(task, triggerId) : undefined;
    if (scopeKey !== undefined) {
      const scopedTokenIds = this.approvalSessionTokenIdsByScope.get(scopeKey) ?? [];
      this.approvalSessionTokenIdsByScope.set(scopeKey, [
        tokenId,
        ...scopedTokenIds.filter((rememberedTokenId) => rememberedTokenId !== tokenId),
      ]);
    }

    this.approvalSessionTokenIds = [
      tokenId,
      ...this.approvalSessionTokenIds.filter((rememberedTokenId) => rememberedTokenId !== tokenId),
    ];
  }

  private scopeKeyForTask(task: Task, triggerId?: string): string {
    const tool = task.metadata?.['tool'];
    if (triggerId !== undefined && triggerId !== 'skill') {
      return `task:${task.id}`;
    }
    if (typeof tool === 'string') {
      return `skill:${tool}`;
    }
    return `task:${task.id}`;
  }
}
