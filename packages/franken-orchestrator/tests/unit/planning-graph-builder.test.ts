import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPlanning, CritiqueSpiralError, CritiqueBudgetHaltError } from '../../src/phases/planning.js';
import { BeastContext } from '../../src/context/franken-context.js';
import { ChunkFileGraphBuilder } from '../../src/planning/chunk-file-graph-builder.js';
import { makePlanner, makeCritique } from '../helpers/stubs.js';
import { defaultConfig } from '../../src/config/orchestrator-config.js';

describe('runPlanning with GraphBuilder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'planning-graph-builder-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses ChunkFileGraphBuilder to populate ctx.plan and still runs it through critique', async () => {
    writeFileSync(join(tmpDir, '05_sample.md'), 'Sample chunk', 'utf-8');

    const ctx = new BeastContext('proj', 'sess', 'input');
    ctx.sanitizedIntent = { goal: 'build from chunks' };

    const planner = makePlanner();
    const critique = makeCritique();
    const graphBuilder = new ChunkFileGraphBuilder(tmpDir);

    await runPlanning(ctx, planner, critique, defaultConfig(), undefined, graphBuilder);

    expect(ctx.plan).toBeDefined();
    expect(ctx.plan!.tasks).toHaveLength(2);
    expect(ctx.plan!.tasks.map((task) => task.id)).toEqual([
      'impl:05_sample',
      'harden:05_sample',
    ]);
    expect(planner.createPlan).not.toHaveBeenCalled();
    // Regression guard for issue #20: a graph-builder plan must not bypass
    // critique review just because it wasn't produced by the planner module.
    expect(critique.reviewPlan).toHaveBeenCalledTimes(1);
    expect(critique.reviewPlan).toHaveBeenCalledWith(ctx.plan);
  });

  it('throws CritiqueSpiralError when critique rejects a graph-builder plan', async () => {
    writeFileSync(join(tmpDir, '05_sample.md'), 'Sample chunk', 'utf-8');

    const ctx = new BeastContext('proj', 'sess', 'input');
    ctx.sanitizedIntent = { goal: 'build from chunks' };

    const planner = makePlanner();
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => ({
        verdict: 'fail' as const,
        findings: [{ evaluator: 'safety', severity: 'critical', message: 'unsafe plan' }],
        score: 0.2,
      })),
    });
    const graphBuilder = new ChunkFileGraphBuilder(tmpDir);

    await expect(
      runPlanning(ctx, planner, critique, defaultConfig(), undefined, graphBuilder),
    ).rejects.toThrow(CritiqueSpiralError);

    expect(critique.reviewPlan).toHaveBeenCalledTimes(1);
    expect(ctx.critiqueFeedback).toBe('safety: unsafe plan');
  });

  it('throws CritiqueBudgetHaltError when critique halts on a graph-builder plan', async () => {
    writeFileSync(join(tmpDir, '05_sample.md'), 'Sample chunk', 'utf-8');

    const ctx = new BeastContext('proj', 'sess', 'input');
    ctx.sanitizedIntent = { goal: 'build from chunks' };

    const planner = makePlanner();
    const critique = makeCritique({
      reviewPlan: vi.fn(async () => ({
        verdict: 'fail' as const,
        findings: [],
        score: 0.1,
        halted: true,
        haltReason: 'budget exceeded',
      })),
    });
    const graphBuilder = new ChunkFileGraphBuilder(tmpDir);

    await expect(
      runPlanning(ctx, planner, critique, defaultConfig(), undefined, graphBuilder),
    ).rejects.toThrow(CritiqueBudgetHaltError);
  });
});
