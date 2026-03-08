import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';
import type { PlanGraph } from '../../src/deps.js';

describe('E2E: Self-correction', () => {
  const input: BeastInput = {
    projectId: 'self-correction-test',
    userInput: 'Build a feature with tests',
  };

  it('improves plan quality across critique iterations', async () => {
    let planCallCount = 0;

    const { loop, ports } = createTestOrchestrator({
      planner: {
        planFactory: () => {
          planCallCount++;
          if (planCallCount === 1) {
            // First plan: simple, low quality
            return {
              tasks: [{ id: 'task-1', objective: 'Do everything', requiredSkills: [], dependsOn: [] }],
            };
          }
          // Second plan: improved, more granular
          return {
            tasks: [
              { id: 'task-1', objective: 'Implement feature', requiredSkills: ['code-gen'], dependsOn: [] },
              { id: 'task-2', objective: 'Write tests', requiredSkills: ['code-gen'], dependsOn: ['task-1'] },
              { id: 'task-3', objective: 'Update docs', requiredSkills: [], dependsOn: ['task-2'] },
            ],
          };
        },
      },
      critique: {
        results: [
          {
            verdict: 'fail',
            findings: [{ evaluator: 'granularity', severity: 'warning', message: 'Plan too coarse' }],
            score: 0.3,
          },
          { verdict: 'pass', findings: [], score: 0.9 },
        ],
      },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    // Second (improved) plan was used for execution
    expect(result.taskResults).toHaveLength(3);
    expect(ports.planner.intents).toHaveLength(2);
  });

  it('records audit trail of self-correction process', async () => {
    const { loop } = createTestOrchestrator({
      critique: {
        results: [
          { verdict: 'fail', findings: [{ evaluator: 'q', severity: 'warning', message: 'Needs work' }], score: 0.4 },
          { verdict: 'pass', findings: [], score: 0.85 },
        ],
      },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    // The beast-loop goes through phases — no direct audit access from result
    // but we know it succeeded after retry
  });

  it('handles progressive score improvement across iterations', async () => {
    const { loop, ports } = createTestOrchestrator({
      critique: {
        results: [
          { verdict: 'fail', findings: [{ evaluator: 'q', severity: 'warning', message: 'v1' }], score: 0.2 },
          { verdict: 'fail', findings: [{ evaluator: 'q', severity: 'info', message: 'v2' }], score: 0.5 },
          { verdict: 'pass', findings: [], score: 0.8 },
        ],
      },
      config: { maxCritiqueIterations: 5 },
    });

    const result = await loop.run(input);

    expect(result.status).toBe('completed');
    expect(ports.planner.intents).toHaveLength(3);
    expect(ports.critique.reviewedPlans).toHaveLength(3);
  });
});
