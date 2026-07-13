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
  private lastGeneratedScopeKey: string | undefined;

  generate(task: Task): RationaleBlock {
    const base = {
      taskId: task.id,
      reasoning: `Executing task: ${task.objective}`,
      expectedOutcome: `Task '${task.id}' completes successfully`,
      timestamp: new Date(deterministicNow()),
    };

    const tool = task.metadata?.['tool'];
    const scopeKey = typeof tool === 'string'
      ? `skill:${tool}`
      : `task:${task.id}`;
    this.lastGeneratedScopeKey = scopeKey;

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

  rememberApprovalSessionToken(tokenId: string): void {
    const scopeKey = this.lastGeneratedScopeKey;
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
}
