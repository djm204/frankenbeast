import { describe, expect, expectTypeOf, it } from 'vitest';
import { createSessionId } from '@franken/types';
import type { ProviderCritiqueFinding } from '@franken/types';
import type {
  CritiquePipelineResult,
  CritiqueResult as DeprecatedCritiqueResult,
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

    expect(compatibilityAlias.results[0]?.findings[0]?.message).toBe(providerFinding.message);
  });

  it('uses the branded @franken/types SessionId contract for critique sessions', () => {
    const sessionId = createSessionId('critique-session-1');

    expectTypeOf(sessionId).toMatchTypeOf<SessionId>();
    expect(sessionId).toBe('critique-session-1');
  });
});
