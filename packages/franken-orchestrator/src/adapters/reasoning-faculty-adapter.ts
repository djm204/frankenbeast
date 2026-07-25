import type { IBrain, IReasoningFaculty } from '@franken/types';
import type { CritiqueResult, ICritiqueModule, PlanGraph } from '../deps.js';
import {
  consolidateFacultyNegativeOutcome,
  consultFacultyLessons,
  FACULTY_LESSON_POLICY,
  MAX_LESSON_QUERY_INPUT_CHARS,
  prepareFacultyLessonQuery,
} from './faculty-learning.js';

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
    private readonly brain: Pick<IBrain, 'episodic' | 'learning'>,
    private readonly clock: () => Date,
    private readonly options: ReasoningFacultyAdapterOptions = {},
  ) {}

  async reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult> {
    const recordEpisodes = this.options.recordEpisodes !== false;
    const query = recordEpisodes ? reasoningLessonQuery(plan) : '';
    if (recordEpisodes) {
      consultFacultyLessons('reasoning', query, this.brain.episodic, this.brain.learning, this.clock().toISOString());
    }
    const result = await this.critique.reviewPlan(plan, context);
    if (!recordEpisodes) return result;

    this.brain.episodic.record({
      type: 'decision',
      step: 'reasoning:critique',
      summary: `Reasoning verdict: ${result.verdict}${result.verdict === 'fail' ? ` — ${query}` : ''}`,
      details: {
        category: 'reasoning-lifecycle',
        outcome: result.halted === true
          ? 'halted'
          : result.verdict === 'fail' ? 'negative' : 'positive',
        lessonContext: query,
        verdict: result.verdict,
        score: result.score,
        findingCount: result.findings.length,
        severities: [...new Set(result.findings.map((finding) => finding.severity))],
        taskCount: plan.tasks.length,
        ...(result.halted === undefined ? {} : { halted: result.halted }),
      },
      createdAt: this.clock().toISOString(),
    });
    if (result.verdict === 'fail' && result.halted !== true) {
      consolidateFacultyNegativeOutcome(this.brain.learning);
    }
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

function reasoningLessonQuery(plan: PlanGraph): string {
  let query = '';
  for (const task of plan.tasks.slice(0, FACULTY_LESSON_POLICY.objectiveLimit)) {
    const separator = query.length === 0 ? '' : ' ';
    const remaining = MAX_LESSON_QUERY_INPUT_CHARS - query.length - separator.length;
    if (remaining <= 0) break;
    query += `${separator}${task.objective.slice(0, remaining)}`;
  }
  return prepareFacultyLessonQuery(query.trim() || 'reasoning plan review');
}