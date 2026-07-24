import type { IBrain, IReasoningFaculty } from '@franken/types';
import type { CritiqueResult, ICritiqueModule, PlanGraph } from '../deps.js';

export interface ReasoningFacultyAdapterOptions {
  readonly recordEpisodes?: boolean;
}

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
    private readonly options: ReasoningFacultyAdapterOptions = {},
  ) {}

  async reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult> {
    const result = await this.critique.reviewPlan(plan, context);
    if (this.options.recordEpisodes === false) return result;

    this.brain.episodic.record({
      type: 'decision',
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

  async checkHealth(): Promise<void> {
    if (this.critique.checkHealth) {
      await this.critique.checkHealth();
      return;
    }
    await this.critique.reviewPlan({ tasks: [] });
  }
}