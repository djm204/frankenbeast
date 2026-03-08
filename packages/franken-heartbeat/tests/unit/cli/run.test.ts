import { describe, it, expect, vi } from 'vitest';
import {
  stubMemory,
  stubObservability,
  stubPlanner,
  stubCritique,
  stubHitl,
  stubLlm,
  getGitStatus,
  buildOrchestratorDeps,
  main,
} from '../../../src/cli/run.js';

describe('CLI stubs', () => {
  it('stubMemory returns empty arrays', async () => {
    expect(await stubMemory.getRecentTraces(24)).toEqual([]);
    expect(await stubMemory.getSuccesses('proj')).toEqual([]);
    expect(await stubMemory.getFailures('proj')).toEqual([]);
    await expect(stubMemory.recordLesson({} as never)).resolves.toBeUndefined();
  });

  it('stubObservability returns empty traces and zero spend', async () => {
    expect(await stubObservability.getTraces(new Date())).toEqual([]);
    const spend = await stubObservability.getTokenSpend(new Date());
    expect(spend.totalTokens).toBe(0);
    expect(spend.totalCostUsd).toBe(0);
    expect(spend.breakdown).toEqual([]);
  });

  it('stubPlanner.injectTask resolves', async () => {
    await expect(stubPlanner.injectTask({} as never)).resolves.toBeUndefined();
  });

  it('stubCritique returns passed audit', async () => {
    const result = await stubCritique.auditConclusions({} as never);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('stub');
  });

  it('stubHitl methods resolve', async () => {
    await expect(stubHitl.sendMorningBrief({} as never)).resolves.toBeUndefined();
    await expect(stubHitl.notifyAlert({} as never)).resolves.toBeUndefined();
  });

  it('stubLlm returns valid JSON reflection', async () => {
    const result = await stubLlm.complete('test', 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.value);
      expect(parsed).toHaveProperty('patterns');
      expect(parsed).toHaveProperty('improvements');
      expect(parsed).toHaveProperty('techDebt');
    }
  });
});

describe('getGitStatus', () => {
  it('returns a GitStatusResult object', async () => {
    const result = await getGitStatus();
    expect(result).toHaveProperty('dirty');
    expect(result).toHaveProperty('files');
    expect(typeof result.dirty).toBe('boolean');
    expect(Array.isArray(result.files)).toBe(true);
  });
});

describe('buildOrchestratorDeps', () => {
  it('builds deps with defaults', () => {
    const deps = buildOrchestratorDeps({
      configPath: undefined,
      heartbeatFilePath: undefined,
      dryRun: false,
      projectId: 'test',
    });

    expect(deps.projectId).toBe('test');
    expect(deps.config.heartbeatFilePath).toBe('./HEARTBEAT.md');
    expect(deps.config.deepReviewHour).toBe(2);
    expect(deps.memory).toBe(stubMemory);
    expect(deps.observability).toBe(stubObservability);
    expect(deps.planner).toBe(stubPlanner);
    expect(deps.critique).toBe(stubCritique);
    expect(deps.hitl).toBe(stubHitl);
    expect(deps.llm).toBe(stubLlm);
  });

  it('applies heartbeatFilePath override', () => {
    const deps = buildOrchestratorDeps({
      configPath: undefined,
      heartbeatFilePath: '/custom/HB.md',
      dryRun: false,
      projectId: 'proj',
    });

    expect(deps.config.heartbeatFilePath).toBe('/custom/HB.md');
  });

  it('uses no-op planner and hitl in dry-run mode', async () => {
    const deps = buildOrchestratorDeps({
      configPath: undefined,
      heartbeatFilePath: undefined,
      dryRun: true,
      projectId: 'proj',
    });

    // Dry-run deps should not be the shared stubs
    expect(deps.planner).not.toBe(stubPlanner);
    expect(deps.hitl).not.toBe(stubHitl);
    // But should still be functional
    await expect(deps.planner.injectTask({} as never)).resolves.toBeUndefined();
    await expect(deps.hitl.sendMorningBrief({} as never)).resolves.toBeUndefined();
  });

  it('uses no-op writeFile in dry-run mode', async () => {
    const deps = buildOrchestratorDeps({
      configPath: undefined,
      heartbeatFilePath: undefined,
      dryRun: true,
      projectId: 'proj',
    });

    // writeFile should be a no-op (no error, no actual write)
    await expect(deps.writeFile('/fake/path', 'content')).resolves.toBeUndefined();
  });

  it('readFile returns empty string on missing file', async () => {
    const deps = buildOrchestratorDeps({
      configPath: undefined,
      heartbeatFilePath: undefined,
      dryRun: false,
      projectId: 'proj',
    });

    // Should not throw on missing file
    const content = await deps.readFile('/nonexistent/file/path/abc123');
    expect(content).toBe('');
  });

  it('clock returns a Date', () => {
    const deps = buildOrchestratorDeps({
      configPath: undefined,
      heartbeatFilePath: undefined,
      dryRun: false,
      projectId: 'proj',
    });

    const now = deps.clock();
    expect(now).toBeInstanceOf(Date);
  });
});

describe('main', () => {
  it('runs and returns valid JSON report', async () => {
    const output = await main(['--dry-run', '--project-id', 'test']);
    const report = JSON.parse(output);
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('pulseResult');
    expect(report).toHaveProperty('actions');
  });

  it('respects --heartbeat-file flag without throwing', async () => {
    const output = await main([
      '--dry-run',
      '--heartbeat-file', '/nonexistent/hb.md',
      '--project-id', 'proj',
    ]);
    const report = JSON.parse(output);
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('pulseResult');
    expect(report.pulseResult).toHaveProperty('status');
  });
});
