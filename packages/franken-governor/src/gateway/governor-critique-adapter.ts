import { randomUUID } from 'node:crypto';
import type { ApprovalRequest, TriggerResult } from '../core/types.js';
import { defaultConfig } from '../core/config.js';
import type { ApprovalChannel } from './approval-channel.js';
import { ApprovalGateway, type AuditRecorder } from './approval-gateway.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import type { RationaleBlock, VerificationResult } from '@franken/types';

export interface GovernorCritiqueAdapterDeps {
  readonly channel: ApprovalChannel;
  readonly auditRecorder: AuditRecorder;
  readonly evaluators: ReadonlyArray<TriggerEvaluator>;
  readonly projectId: string;
}

export class GovernorCritiqueAdapter {
  private readonly gateway: ApprovalGateway;
  private readonly evaluators: ReadonlyArray<TriggerEvaluator>;
  private readonly projectId: string;

  constructor(deps: GovernorCritiqueAdapterDeps) {
    this.gateway = new ApprovalGateway({
      channel: deps.channel,
      auditRecorder: deps.auditRecorder,
      config: defaultConfig(),
    });
    this.evaluators = deps.evaluators;
    this.projectId = deps.projectId;
  }

  async verifyRationale(rationale: RationaleBlock): Promise<VerificationResult> {
    const triggerResult = this.evaluateTriggers(rationale);

    if (!triggerResult.triggered) {
      return { verdict: 'approved' };
    }

    const base = {
      requestId: randomUUID(),
      taskId: rationale.taskId as string,
      projectId: this.projectId,
      trigger: triggerResult,
      summary: `${rationale.reasoning} → ${rationale.expectedOutcome}`,
      timestamp: new Date(),
    };

    const request: ApprovalRequest = rationale.selectedTool !== undefined
      ? { ...base, skillId: rationale.selectedTool }
      : base;

    const outcome = await this.gateway.requestApproval(request);

    switch (outcome.decision) {
      case 'APPROVE':
        return { verdict: 'approved' };
      case 'REGEN':
        return { verdict: 'rejected', reason: outcome.feedback };
      case 'ABORT':
        return { verdict: 'rejected', reason: outcome.reason ?? 'Aborted by human' };
      case 'DEBUG':
        return { verdict: 'approved' };
    }
  }

  private evaluateTriggers(rationale: RationaleBlock): TriggerResult {
    for (const evaluator of this.evaluators) {
      const result = evaluator.evaluate(rationale);
      if (result.triggered) return result;
    }
    return { triggered: false, triggerId: 'none' };
  }
}
