import type { IEpisodicMemory, IActionFaculty } from '@franken/types';
import type { ApprovalOutcome, ApprovalPayload, IGovernorModule } from '../deps.js';

/**
 * Makes governor decisions available through the brain action faculty while
 * preserving the governor as the sole authority for approval outcomes.
 */
export class ActionFacultyAdapter implements IActionFaculty, IGovernorModule {
  readonly kind = 'action' as const;
  readonly configured = true;

  constructor(
    private readonly governor: IGovernorModule,
    private readonly episodic: IEpisodicMemory,
    private readonly clock: () => Date,
  ) {}

  async requestApproval(request: ApprovalPayload): Promise<ApprovalOutcome> {
    const outcome = await this.governor.requestApproval(request);
    try {
      this.episodic.record({
        type: 'decision',
        step: 'action:governor',
        summary: `Action decision (${outcome.decision}): ${request.summary}`,
        details: {
          taskId: request.taskId,
          ...(request.skillId === undefined ? {} : { skillId: request.skillId }),
          requiresHitl: request.requiresHitl,
          decision: outcome.decision,
          reason: outcome.reason ?? defaultDecisionReason(request, outcome),
        },
        createdAt: this.clock().toISOString(),
      });
    } catch {
      // Observability must never replace or bypass the governor's decision.
    }
    return outcome;
  }
}

function defaultDecisionReason(request: ApprovalPayload, outcome: ApprovalOutcome): string {
  if (outcome.decision === 'approved') {
    return request.requiresHitl
      ? 'The governor approved the HITL request.'
      : 'The request did not require HITL approval.';
  }
  return outcome.decision === 'abort'
    ? 'The governor aborted the request.'
    : 'The governor rejected the request.';
}
