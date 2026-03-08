import { describe, it, expect, vi } from 'vitest';
import { CritiquePortAdapter } from '../../../src/adapters/critique-adapter.js';

const plan = {
  tasks: [
    { id: 't1', objective: 'Design', requiredSkills: ['plan'], dependsOn: [] },
  ],
};

describe('CritiquePortAdapter', () => {
  it('maps critique pass results into CritiqueResult', async () => {
    const loop = {
      run: vi.fn().mockResolvedValue({
        verdict: 'pass',
        iterations: [
          {
            index: 0,
            input: { content: 'plan', metadata: {} },
            result: {
              verdict: 'pass',
              overallScore: 0.9,
              results: [],
              shortCircuited: false,
            },
            completedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
      }),
    };

    const adapter = new CritiquePortAdapter({
      loop,
      config: {
        maxIterations: 1,
        tokenBudget: 1000,
        consensusThreshold: 2,
        sessionId: 'sess-1',
        taskId: 'plan-review',
      },
    });

    const result = await adapter.reviewPlan(plan);

    expect(result).toEqual({ verdict: 'pass', findings: [], score: 0.9 });
    expect(loop.run).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Design') }),
      expect.objectContaining({ maxIterations: 1 }),
    );
  });

  it('maps critique failures with findings', async () => {
    const loop = {
      run: vi.fn().mockResolvedValue({
        verdict: 'fail',
        iterations: [
          {
            index: 0,
            input: { content: 'plan', metadata: {} },
            result: {
              verdict: 'fail',
              overallScore: 0.4,
              shortCircuited: false,
              results: [
                {
                  evaluatorName: 'Logic',
                  verdict: 'fail',
                  score: 0.3,
                  findings: [{ message: 'Missing step', severity: 'high' }],
                },
              ],
            },
            completedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
        correction: {
          summary: 'Fix the plan',
          findings: [],
          score: 0.4,
          iterationCount: 1,
        },
      }),
    };

    const adapter = new CritiquePortAdapter({
      loop,
      config: {
        maxIterations: 1,
        tokenBudget: 1000,
        consensusThreshold: 2,
        sessionId: 'sess-1',
        taskId: 'plan-review',
      },
    });

    const result = await adapter.reviewPlan(plan);

    expect(result).toEqual({
      verdict: 'fail',
      score: 0.4,
      findings: [{ evaluator: 'Logic', severity: 'high', message: 'Missing step' }],
    });
  });

  it('uses correction findings when iteration results are empty', async () => {
    const loop = {
      run: vi.fn().mockResolvedValue({
        verdict: 'fail',
        iterations: [
          {
            index: 0,
            input: { content: 'plan', metadata: {} },
            result: {
              verdict: 'fail',
              overallScore: 0.2,
              shortCircuited: false,
              results: [],
            },
            completedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
        correction: {
          summary: 'Fix the plan',
          findings: [{ message: 'Missing coverage', severity: 'medium' }],
          score: 0.2,
          iterationCount: 1,
        },
      }),
    };

    const adapter = new CritiquePortAdapter({
      loop,
      config: {
        maxIterations: 1,
        tokenBudget: 1000,
        consensusThreshold: 2,
        sessionId: 'sess-1',
        taskId: 'plan-review',
      },
    });

    const result = await adapter.reviewPlan(plan);

    expect(result).toEqual({
      verdict: 'fail',
      score: 0.2,
      findings: [{ evaluator: 'critique-loop', severity: 'medium', message: 'Missing coverage' }],
    });
  });
});
