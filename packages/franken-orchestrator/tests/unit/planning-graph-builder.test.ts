import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPlanning } from '../../src/phases/planning.js';
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

  it('uses ChunkFileGraphBuilder to populate ctx.plan without critique', async () => {
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
    expect(critique.reviewPlan).not.toHaveBeenCalled();
  });
});
