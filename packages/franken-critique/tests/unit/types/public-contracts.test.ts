import { describe, expect, expectTypeOf, it } from 'vitest';
import { createSessionId } from '@franken/types';
import type { ProviderCritiqueFinding } from '@franken/types';
import type {
  CritiquePipelineResult,
  CritiqueResult as DeprecatedCritiqueResult,
  LessonRollbackWorkflow,
  AgentImprovementScorecard,
  SessionId,
} from '@franken/critique';

describe('public critique type contracts', () => {
  it('imports provider findings and critique pipeline results without alias confusion', () => {
    const providerFinding: ProviderCritiqueFinding = {
      evaluator: 'reflection',
      severity: 7,
      message: 'Missing error handling',
    };

    const pipelineResult: CritiquePipelineResult = {
      verdict: 'warn',
      overallScore: 0.75,
      results: [
        {
          evaluatorName: providerFinding.evaluator,
          verdict: 'warn',
          score: 0.75,
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
    const compatibilityAlias: DeprecatedCritiqueResult = pipelineResult;

    expect(compatibilityAlias.results[0]?.findings[0]?.message).toBe(
      providerFinding.message,
    );
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

  it('exports per-agent improvement scorecards from the public barrel', () => {
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
      improvementSignals: ['Recovered from 1 failing critique iteration before pass.'],
      guidance: 'copy into PM handoff',
    };

    expect(scorecard.schemaVersion).toBe('agent-improvement-scorecard-v1');
  });
});
