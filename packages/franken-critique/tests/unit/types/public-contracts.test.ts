import { describe, expect, expectTypeOf, it } from 'vitest';
import { createSessionId } from '@franken/types';
import type {
  ProviderCritiqueFinding,
  Score as SharedScore,
} from '@franken/types';
import {
  ConfigurationError,
  createScore,
  RequiredEvaluatorSelectionError,
  UnknownEvaluatorError,
} from '@franken/critique';
import type {
  CritiquePipelineRunOptions,
  CritiquePipelineResult,
  CritiqueResult,
  LessonRollbackWorkflow,
  AgentImprovementScorecard,
  LessonFeedbackWeighting,
  Score,
  SessionId,
} from '@franken/critique';

describe('public critique type contracts', () => {
  it('exports evaluator selection options and errors', () => {
    const options: CritiquePipelineRunOptions = {
      evaluatorNames: ['safety'],
    };
    const error = new UnknownEvaluatorError(['missing']);

    expect(options.evaluatorNames).toEqual(['safety']);
    expect(error.evaluatorNames).toEqual(['missing']);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.code).toBe('CONFIGURATION_INVALID');

    const requiredError = new RequiredEvaluatorSelectionError(['safety']);
    expect(requiredError).toBeInstanceOf(ConfigurationError);
    expect(requiredError.requiredEvaluatorNames).toEqual(['safety']);
  });

  it('imports provider findings and critique pipeline results without alias confusion', () => {
    const providerFinding: ProviderCritiqueFinding = {
      evaluator: 'reflection',
      severity: 7,
      message: 'Missing error handling',
    };
    const score = createScore(0.75);

    const pipelineResult: CritiquePipelineResult = {
      verdict: 'warn',
      overallScore: score,
      results: [
        {
          evaluatorName: providerFinding.evaluator,
          verdict: 'warn',
          score,
          findings: [
            {
              message: providerFinding.message,
              severity: 'warning',
            },
          ],
        },
      ],
      shortCircuited: false,
    };
    const alias: CritiquePipelineResult = pipelineResult;
    const legacyAlias: CritiqueResult = pipelineResult;

    expect(alias.results[0]?.findings[0]?.message).toBe(
      providerFinding.message,
    );
    expect(legacyAlias.results[0]?.findings[0]?.message).toBe(
      providerFinding.message,
    );
  });

  it('uses the shared branded score contract for critique results', () => {
    const score = createScore(0.75);

    expectTypeOf(score).toEqualTypeOf<Score>();
    expectTypeOf<Score>().toEqualTypeOf<SharedScore>();
    // @ts-expect-error Score must be constructed through the shared constructor.
    const unbrandedScore: Score = 0.75;
    expect(unbrandedScore).toBe(0.75);
  });

  it('uses the branded @franken/types SessionId contract for critique sessions', () => {
    const sessionId = createSessionId('critique-session-1');

    expectTypeOf(sessionId).toMatchTypeOf<SessionId>();
    expect(sessionId).toBe('critique-session-1');
  });

  it('exports lesson rollback workflow metadata from the public barrel', () => {
    const workflow: LessonRollbackWorkflow = {
      workflowId: 'lesson-rollback-v1',
      eligibleStates: ['experimental'],
      steps: ['quarantine lesson'],
      requiredEvidence: ['regression evidence'],
      requestSchema: {
        lessonId: 'string',
        rollbackReason: 'string',
        evidenceUrls: 'string[]',
        replacementLesson: 'string-or-null',
        verificationCommand: 'string',
      },
      insufficientEvidenceGuidance: 'keep rollback blocked',
    };

    expect(workflow.workflowId).toBe('lesson-rollback-v1');
  });

  it('exports per-agent improvement scorecards and feedback weighting from the public barrel', () => {
    const scorecard: AgentImprovementScorecard = {
      schemaVersion: 'agent-improvement-scorecard-v1',
      agentId: 'worker-alpha',
      taskId: 'task-1',
      evaluatorName: 'quality-gate',
      generatedAt: '2026-07-12T00:00:00.000Z',
      initialScore: 0.2,
      finalScore: 1,
      scoreDelta: 0.8,
      failingIterations: [0],
      resolvedIteration: 1,
      findingCounts: {
        critical: 1,
        warning: 0,
        info: 0,
        total: 1,
      },
      improvementSignals: [
        'Recovered from 1 failing critique iteration before pass.',
      ],
      guidance: 'copy into PM handoff',
    };

    expect(scorecard.schemaVersion).toBe('agent-improvement-scorecard-v1');

    const feedbackWeighting: LessonFeedbackWeighting = {
      schemaVersion: 'lesson-feedback-weighting-v1',
      primarySource: 'explicit-user-correction',
      totalScore: -75,
      weights: [
        {
          source: 'explicit-user-correction',
          weight: 100,
          scoreImpact: -100,
          observedAt: '2026-07-12T01:00:00.000Z',
          rationale: 'User corrected stale learned guidance.',
        },
        {
          source: 'inferred-success',
          weight: 25,
          scoreImpact: 25,
          observedAt: '2026-07-12T00:00:00.000Z',
          rationale: 'Lesson was inferred from a passing retry.',
        },
      ],
      guidance: 'human feedback wins over inferred signals',
    };

    expect(feedbackWeighting.primarySource).toBe('explicit-user-correction');
  });
});
