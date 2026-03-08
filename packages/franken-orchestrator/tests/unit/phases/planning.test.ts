import { describe, it, expect, vi } from 'vitest';
import { runPlanning, CritiqueSpiralError } from '../../../src/phases/planning.js';
import { BeastContext } from '../../../src/context/franken-context.js';
import { makePlanner, makeCritique, makeLogger } from '../../helpers/stubs.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

function ctx(): BeastContext {
  const c = new BeastContext('proj', 'sess', 'input');
  c.sanitizedIntent = { goal: 'build a feature' };
  return c;
}

describe('runPlanning', () => {
  it('creates plan and stores on context when critique passes', async () => {
    const c = ctx();
    await runPlanning(c, makePlanner(), makeCritique(), defaultConfig());

    expect(c.plan).toBeDefined();
    expect(c.plan!.tasks).toHaveLength(1);
    expect(c.phase).toBe('planning');
  });

  it('passes sanitizedIntent to planner', async () => {
    const c = ctx();
    c.sanitizedIntent = { goal: 'refactor module', strategy: 'parallel' };
    const planner = makePlanner();
    await runPlanning(c, planner, makeCritique(), defaultConfig());

    expect(planner.createPlan).toHaveBeenCalledWith({
      goal: 'refactor module',
      strategy: 'parallel',
      context: undefined,
    });
  });

  it('retries on critique failure then succeeds', async () => {
    const c = ctx();
    let callCount = 0;
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return { verdict: 'fail' as const, findings: [{ evaluator: 'test', severity: 'warning', message: 'needs work' }], score: 0.3 };
        }
        return { verdict: 'pass' as const, findings: [], score: 0.9 };
      }),
    });

    await runPlanning(c, makePlanner(), critique, defaultConfig());

    expect(critique.reviewPlan).toHaveBeenCalledTimes(2);
  });

  it('throws CritiqueSpiralError after max iterations', async () => {
    const c = ctx();
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => ({
        verdict: 'fail' as const,
        findings: [{ evaluator: 'test', severity: 'critical', message: 'bad' }],
        score: 0.2,
      })),
    });
    const config = { ...defaultConfig(), maxCritiqueIterations: 2 };

    await expect(runPlanning(c, makePlanner(), critique, config))
      .rejects.toThrow(CritiqueSpiralError);
  });

  it('CritiqueSpiralError includes iteration count and last score', async () => {
    const c = ctx();
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => ({
        verdict: 'fail' as const,
        findings: [],
        score: 0.4,
      })),
    });

    try {
      await runPlanning(c, makePlanner(), critique, { ...defaultConfig(), maxCritiqueIterations: 3 });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CritiqueSpiralError);
      expect((e as CritiqueSpiralError).iterations).toBe(3);
      expect((e as CritiqueSpiralError).lastScore).toBe(0.4);
    }
  });

  it('throws if sanitizedIntent is missing', async () => {
    const c = new BeastContext('proj', 'sess', 'input');
    await expect(runPlanning(c, makePlanner(), makeCritique(), defaultConfig()))
      .rejects.toThrow('Cannot plan without sanitizedIntent');
  });

  it('respects minCritiqueScore threshold', async () => {
    const c = ctx();
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => ({
        verdict: 'pass' as const,
        findings: [],
        score: 0.5, // Below default 0.7 threshold
      })),
    });

    await expect(
      runPlanning(c, makePlanner(), critique, { ...defaultConfig(), maxCritiqueIterations: 1 }),
    ).rejects.toThrow(CritiqueSpiralError);
  });

  it('adds audit entries for each iteration', async () => {
    const c = ctx();
    let callCount = 0;
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => {
        callCount++;
        if (callCount < 2) return { verdict: 'fail' as const, findings: [], score: 0.3 };
        return { verdict: 'pass' as const, findings: [], score: 0.9 };
      }),
    });

    await runPlanning(c, makePlanner(), critique, defaultConfig());

    const planAudits = c.audit.filter(a => a.action === 'plan:created');
    const reviewAudits = c.audit.filter(a => a.action === 'plan:reviewed');
    expect(planAudits).toHaveLength(2);
    expect(reviewAudits).toHaveLength(2);
  });

  it('logs plan creation, critique verdict, and replans', async () => {
    const c = ctx();
    const logger = makeLogger();
    let callCount = 0;
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return { verdict: 'fail' as const, findings: [], score: 0.2 };
        }
        return { verdict: 'pass' as const, findings: [], score: 0.95 };
      }),
    });
    const planner = makePlanner({
      createPlan: vi.fn(async () => ({
        tasks: [
          { id: 't1', objective: 'do it', requiredSkills: [], dependsOn: [] },
          { id: 't2', objective: 'then this', requiredSkills: [], dependsOn: [] },
        ],
      })),
    });

    await runPlanning(c, planner, critique, defaultConfig(), logger);

    expect(logger.info).toHaveBeenCalledWith(
      'Planning: plan created',
      expect.objectContaining({ taskCount: 2, iteration: 1 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Planning: critique reviewed',
      expect.objectContaining({ verdict: 'pass', score: 0.95 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Planning: replan',
      expect.objectContaining({ iteration: 2 }),
    );
  });
});
