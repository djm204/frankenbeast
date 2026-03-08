import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';

describe('E2E: Critique retry', () => {
  const input: BeastInput = {
    projectId: 'critique-retry',
    userInput: 'Build a complex feature',
  };

  it('retries planning when first critique fails then second passes', async () => {
    const { loop, ports } = createTestOrchestrator({
      critique: {
        results: [
          { verdict: 'fail', findings: [{ evaluator: 'quality', severity: 'warning', message: 'Needs more tests' }], score: 0.4 },
          { verdict: 'pass', findings: [], score: 0.9 },
        ],
      },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    // Plan was created twice (failed + succeeded)
    expect(ports.planner.intents).toHaveLength(2);
    expect(ports.critique.reviewedPlans).toHaveLength(2);
  });

  it('aborts with CritiqueSpiralError after max iterations exhausted', async () => {
    const { loop, ports } = createTestOrchestrator({
      critique: {
        results: [
          { verdict: 'fail', findings: [{ evaluator: 'q', severity: 'warning', message: 'bad' }], score: 0.3 },
        ],
      },
      config: { maxCritiqueIterations: 2 },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('aborted');
    expect(result.abortReason).toContain('Critique spiral');
    expect(ports.planner.intents).toHaveLength(2);
    expect(ports.critique.reviewedPlans).toHaveLength(2);
  });

  it('passes on first attempt when score meets threshold', async () => {
    const { loop, ports } = createTestOrchestrator({
      critique: {
        results: [{ verdict: 'pass', findings: [], score: 0.95 }],
      },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(ports.planner.intents).toHaveLength(1);
    expect(ports.critique.reviewedPlans).toHaveLength(1);
  });

  it('respects minCritiqueScore threshold', async () => {
    const { loop, ports } = createTestOrchestrator({
      critique: {
        results: [
          // Verdict is 'pass' but score below threshold
          { verdict: 'pass', findings: [], score: 0.5 },
          { verdict: 'pass', findings: [], score: 0.8 },
        ],
      },
      config: { minCritiqueScore: 0.7 },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    // First attempt had pass verdict but low score, so retried
    expect(ports.planner.intents).toHaveLength(2);
  });
});
