import type { IBrain, IReasoningFaculty } from '@franken/types';
import type { CritiqueResult, ICritiqueModule, PlanGraph } from '../deps.js';

/**
 * Makes the existing critique chain an agent-scoped reasoning faculty while
 * preserving the critique port used by the orchestration phases.
 */
export class ReasoningFacultyAdapter implements ICritiqueModule, IReasoningFaculty {
  readonly kind = 'reasoning' as const;
  readonly configured = true;

  constructor(
    private readonly critique: ICritiqueModule,
    private readonly brain: Pick<IBrain, 'episodic'>,
    private readonly clock: () => Date,
  ) {}

  async reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult> {
    const result = await this.critique.reviewPlan(plan, context);
    this.brain.episodic.record({
      type: result.verdict === 'fail' ? 'failure' : 'decision',
      step: 'reasoning:critique',
      summary: `Reasoning verdict: ${result.verdict}`,
      details: {
        verdict: result.verdict,
        score: result.score,
        findingCount: result.findings.length,
        severities: [...new Set(result.findings.map((finding) => finding.severity))],
        taskCount: plan.tasks.length,
        ...(result.halted === undefined ? {} : { halted: result.halted }),
      },
      createdAt: this.clock().toISOString(),
    });
    return result;
  }
}