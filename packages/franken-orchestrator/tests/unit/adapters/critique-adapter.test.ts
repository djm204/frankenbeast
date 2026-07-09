import { describe, it, expect, vi } from 'vitest';
import { CritiquePortAdapter } from '../../../src/adapters/critique-adapter.js';

const plan = {
  tasks: [
    { id: 't1', objective: 'Design', requiredSkills: ['plan'], dependsOn: [] },
  ],
};

const EVALUATOR_EXCEPTION_LOCATION = 'internal:evaluator-exception';

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

  it('treats evaluator infrastructure exceptions as terminal instead of replanning feedback', async () => {
    const loop = {
      run: vi.fn().mockResolvedValue({
        verdict: 'fail',
        iterations: [
          {
            index: 0,
            input: { content: 'plan', metadata: {} },
            result: {
              verdict: 'fail',
              overallScore: 0,
              shortCircuited: false,
              results: [
                {
                  evaluatorName: 'adr-compliance',
                  verdict: 'fail',
                  score: 0,
                  findings: [
                    {
                      message: 'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
                      severity: 'critical',
                      location: EVALUATOR_EXCEPTION_LOCATION,
                    },
                  ],
                },
              ],
            },
            completedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
        correction: {
          summary: 'Fix the plan',
          findings: [],
          score: 0,
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
      score: 0,
      findings: [
        {
          evaluator: 'adr-compliance',
          severity: 'critical',
          message: 'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
          location: EVALUATOR_EXCEPTION_LOCATION,
        },
      ],
      halted: true,
      haltReason: 'Critique evaluator infrastructure failure',
    });
  });

  it('treats escalated evaluator infrastructure exceptions as terminal', async () => {
    const loop = {
      run: vi.fn().mockResolvedValue({
        verdict: 'escalated',
        iterations: [
          {
            index: 0,
            input: { content: 'plan', metadata: {} },
            result: {
              verdict: 'fail',
              overallScore: 0,
              shortCircuited: false,
              results: [
                {
                  evaluatorName: 'adr-compliance',
                  verdict: 'fail',
                  score: 0,
                  findings: [
                    {
                      message: 'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
                      severity: 'critical',
                      location: EVALUATOR_EXCEPTION_LOCATION,
                    },
                  ],
                },
              ],
            },
            completedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
        escalation: { reason: 'Consensus failure' },
      }),
    };

    const adapter = new CritiquePortAdapter({
      loop,
      config: {
        maxIterations: 1,
        tokenBudget: 1000,
        consensusThreshold: 0.7,
        sessionId: 'sess-1',
        taskId: 'plan-review',
      },
    });

    const result = await adapter.reviewPlan(plan);

    expect(result).toEqual({
      verdict: 'fail',
      score: 0,
      findings: [
        {
          evaluator: 'adr-compliance',
          severity: 'critical',
          message: 'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
          location: EVALUATOR_EXCEPTION_LOCATION,
        },
      ],
      halted: true,
      haltReason: 'Critique evaluator infrastructure failure',
    });
  });

  it('flags halted loop results as terminal (regression: PR #343 P1)', async () => {
    const loop = {
      run: vi.fn().mockResolvedValue({
        verdict: 'halted',
        reason: 'Cost budget exceeded: $10.50 > $10.00',
        iterations: [
          {
            index: 0,
            input: { content: 'plan', metadata: {} },
            result: {
              verdict: 'fail',
              overallScore: 0.5,
              shortCircuited: true,
              results: [],
            },
            completedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
      }),
    };

    const adapter = new CritiquePortAdapter({
      loop,
      config: {
        maxIterations: 3,
        tokenBudget: 1000,
        consensusThreshold: 2,
        sessionId: 'sess-1',
        taskId: 'plan-review',
      },
    });

    const result = await adapter.reviewPlan(plan);

    expect(result).toEqual({
      verdict: 'fail',
      score: 0.5,
      findings: [{ evaluator: 'critique-loop', severity: 'high', message: 'Cost budget exceeded: $10.50 > $10.00' }],
      halted: true,
      haltReason: 'Cost budget exceeded: $10.50 > $10.00',
    });
  });
});
