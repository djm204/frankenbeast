import { afterEach, describe, expect, it, vi } from 'vitest';

import { SqliteBrain } from '@franken/brain';
import { ReasoningFacultyAdapter } from '../../../src/adapters/reasoning-faculty-adapter.js';
import type { ICritiqueModule, PlanGraph } from '../../../src/deps.js';

describe('ReasoningFacultyAdapter', () => {
  const brains: SqliteBrain[] = [];

  afterEach(() => {
    for (const brain of brains.splice(0)) {
      brain.close();
    }
  });

  it('delegates critique unchanged and records its verdict as a recallable episode', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const result = {
      verdict: 'warn' as const,
      findings: [{ evaluator: 'factuality', severity: 'medium', message: 'Verify the claim' }],
      score: 0.75,
    };
    const critique: ICritiqueModule = {
      reviewPlan: vi.fn(async () => result),
    };
    const faculty = new ReasoningFacultyAdapter(
      critique,
      brain,
      () => new Date('2026-07-24T12:00:00.000Z'),
    );
    const plan: PlanGraph = {
      tasks: [{ id: 'task-1', objective: 'Check the claim', requiredSkills: [], dependsOn: [] }],
    };
    const context = { source: 'test' };

    await expect(faculty.reviewPlan(plan, context)).resolves.toBe(result);
    expect(critique.reviewPlan).toHaveBeenCalledWith(plan, context);
    expect(faculty).toMatchObject({ kind: 'reasoning', configured: true });
    expect(brain.episodic.recall('reasoning verdict warn')).toEqual([
      expect.objectContaining({
        type: 'decision',
        step: 'reasoning:critique',
        summary: 'Reasoning verdict: warn',
        createdAt: '2026-07-24T12:00:00.000Z',
        details: {
          verdict: 'warn',
          score: 0.75,
          findingCount: 1,
          severities: ['medium'],
          taskCount: 1,
        },
      }),
    ]);
  });
});
