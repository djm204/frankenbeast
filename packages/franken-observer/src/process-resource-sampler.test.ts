import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQLiteAdapter } from './adapters/sqlite/SQLiteAdapter.js';
import {
  DEFAULT_RESOURCE_SAMPLE_INTERVAL_MS,
  ProcessResourceSampler,
  estimateProcessPower,
  type ProcessResourceSample,
} from './resource/ProcessResourceSampler.js';

const tempDirs: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function spawnIdleChild(): Promise<ChildProcess & { pid: number }> {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1_000)'], {
    stdio: 'ignore',
  });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  if (child.pid === undefined) throw new Error('Child process did not expose a PID');
  return child as ChildProcess & { pid: number };
}

function persistedSample(overrides: Partial<ProcessResourceSample> = {}): ProcessResourceSample {
  return {
    agentId: 'agent-1',
    runId: 'run-1',
    pid: 123,
    cpuPercent: 25,
    rssBytes: 4_096,
    estimatedWatts: 26.25,
    estimatedEnergyWh: 0.01,
    timestamp: 1_000,
    ...overrides,
  };
}

describe('ProcessResourceSampler', () => {
  it('samples CPU and RSS from a real child process', async () => {
    const child = await spawnIdleChild();
    const sampler = new ProcessResourceSampler({
      pid: child.pid,
      agentId: 'agent-real',
      runId: 'run-real',
    });

    const sample = await sampler.sample();

    expect(sample).toMatchObject({
      pid: child.pid,
      agentId: 'agent-real',
      runId: 'run-real',
    });
    expect(sample.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(sample.rssBytes).toBeGreaterThan(0);
    expect(sample.estimatedWatts).toBeGreaterThan(0);
    expect(sample.timestamp).toBeGreaterThan(0);
  });

  it('uses a documented default interval and accepts a configured interval', () => {
    const defaultSampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-default',
      runId: 'run-default',
    });
    const configuredSampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-configured',
      runId: 'run-configured',
      intervalMs: 9_000,
    });

    expect(defaultSampler.intervalMs).toBe(DEFAULT_RESOURCE_SAMPLE_INTERVAL_MS);
    expect(configuredSampler.intervalMs).toBe(9_000);
  });

  it('serializes interval writes and drains the active sample before stopping', async () => {
    vi.useFakeTimers();
    let releaseWrite: (() => void) | undefined;
    let activeWrites = 0;
    let maxActiveWrites = 0;
    let writeCount = 0;
    const sampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-interval',
      runId: 'run-interval',
      intervalMs: 100,
      adapter: {
        async recordResourceSample() {
          writeCount += 1;
          activeWrites += 1;
          maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
          await new Promise<void>(resolve => { releaseWrite = resolve; });
          activeWrites -= 1;
        },
      },
    });

    sampler.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(writeCount).toBe(1);
    expect(maxActiveWrites).toBe(1);

    let stopped = false;
    const stopping = sampler.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    releaseWrite?.();
    await stopping;
    await vi.advanceTimersByTimeAsync(500);

    expect(stopped).toBe(true);
    expect(writeCount).toBe(1);
  });

  it('normalizes agent and run identifiers before returning or persisting samples', async () => {
    const sampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: '  agent-normalized  ',
      runId: '  run-normalized  ',
    });

    await expect(sampler.sample()).resolves.toMatchObject({
      agentId: 'agent-normalized',
      runId: 'run-normalized',
    });
  });

  it('uses monotonic elapsed time when the wall clock moves backward', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(1);
    const sampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-clock',
      runId: 'run-clock',
    });

    await sampler.sample();
    const second = await sampler.sample();

    expect(second.timestamp).toBe(1);
    expect(second.estimatedEnergyWh).toBeGreaterThan(0);
  });

  it('drains a manual sample before stopping', async () => {
    let releaseWrite: (() => void) | undefined;
    let writeCompleted = false;
    const sampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-manual',
      runId: 'run-manual',
      adapter: {
        async recordResourceSample() {
          await new Promise<void>(resolve => { releaseWrite = resolve; });
          writeCompleted = true;
        },
      },
    });

    const sampling = sampler.sample();
    setTimeout(() => releaseWrite?.(), 10);
    const writeCompletedWhenStopped = await sampler.stop().then(() => writeCompleted);
    await sampling;

    expect(writeCompletedWhenStopped).toBe(true);
  });

  it('contains rejections from the background error callback', async () => {
    const sampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-error',
      runId: 'run-error',
      adapter: {
        async recordResourceSample() { throw new Error('write failed'); },
      },
      async onError() { throw new Error('reporting failed'); },
    });

    sampler.start();
    await expect(sampler.stop()).resolves.toBeUndefined();
  });

  it('awaits asynchronous sample callbacks before stopping', async () => {
    let releaseCallback: (() => void) | undefined;
    let callbackCompleted = false;
    const sampler = new ProcessResourceSampler({
      pid: process.pid,
      agentId: 'agent-callback',
      runId: 'run-callback',
      async onSample() {
        await new Promise<void>(resolve => { releaseCallback = resolve; });
        callbackCompleted = true;
      },
    });

    const sampling = sampler.sample();
    setTimeout(() => releaseCallback?.(), 10);
    const callbackCompletedWhenStopped = await sampler.stop().then(() => callbackCompleted);
    await sampling;

    expect(callbackCompletedWhenStopped).toBe(true);
  });

  it('persists sampled runtime data through SQLite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'resource-sampler-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'));
    const child = await spawnIdleChild();
    const sampler = new ProcessResourceSampler({
      pid: child.pid,
      agentId: 'agent-persisted',
      runId: 'run-persisted',
      adapter,
    });

    const sample = await sampler.sample();

    await expect(adapter.queryResourceSamples({ runId: 'run-persisted' })).resolves.toEqual([sample]);
    await adapter.close();
  });
});

describe('estimateProcessPower', () => {
  it.each([
    [0, 10],
    [50, 35],
    [100, 60],
    [250, 60],
  ])('estimates watts for %s%% CPU utilization', (cpuPercent, expectedWatts) => {
    expect(estimateProcessPower(cpuPercent, { idleWatts: 10, tdpWatts: 50 })).toBe(expectedWatts);
  });
});

describe('SQLiteAdapter resource samples', () => {
  it('queries samples by agent or run within an inclusive time range', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'resource-query-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'), { useWorkerThread: false });
    await adapter.recordResourceSample(persistedSample({ timestamp: 999 }));
    await adapter.recordResourceSample(persistedSample({ timestamp: 1_000 }));
    await adapter.recordResourceSample(persistedSample({ timestamp: 1_500, runId: 'run-2' }));
    await adapter.recordResourceSample(persistedSample({ timestamp: 2_000 }));
    await adapter.recordResourceSample(persistedSample({ timestamp: 2_001 }));
    await adapter.recordResourceSample(persistedSample({ timestamp: 1_750, agentId: 'agent-2' }));

    await expect(adapter.queryResourceSamples({
      agentId: 'agent-1',
      runId: 'run-1',
      since: 1_000,
      before: 2_000,
    })).resolves.toEqual([
      persistedSample({ timestamp: 2_000 }),
      persistedSample({ timestamp: 1_000 }),
    ]);
    await expect(adapter.queryResourceSamples({ agentId: 'agent-1' })).resolves.toHaveLength(5);
    await expect(adapter.queryResourceSamples({ runId: 'run-2' })).resolves.toEqual([
      persistedSample({ timestamp: 1_500, runId: 'run-2' }),
    ]);
    await expect(adapter.queryResourceSamples({ agentId: ' ', runId: 'run-1' })).resolves.toHaveLength(5);

    await adapter.close();
  });

  it('normalizes direct-write identifiers and rejects empty identifiers', async () => {
    const adapter = new SQLiteAdapter(':memory:', { useWorkerThread: false });
    const sample = persistedSample({ agentId: '  agent-direct  ', runId: '  run-direct  ' });

    await adapter.recordResourceSample(sample);
    await expect(adapter.queryResourceSamples({ agentId: 'agent-direct' })).resolves.toEqual([
      { ...sample, agentId: 'agent-direct', runId: 'run-direct' },
    ]);
    await expect(adapter.recordResourceSample({ ...sample, agentId: '   ' })).rejects.toThrow(TypeError);

    await adapter.close();
  });

  it('does not treat an independent resource run ID as a trace ID during deletion', async () => {
    const adapter = new SQLiteAdapter(':memory:', { useWorkerThread: false });
    await adapter.recordResourceSample(persistedSample({ runId: 'shared-id' }));

    await adapter.deleteTrace('shared-id');

    await expect(adapter.queryResourceSamples({ runId: 'shared-id' })).resolves.toHaveLength(1);
    await adapter.close();
  });

  it('supports explicit retention pruning without deleting recent samples', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'resource-retention-'));
    tempDirs.push(dir);
    const adapter = new SQLiteAdapter(join(dir, 'traces.db'));
    await adapter.recordResourceSample(persistedSample({ runId: 'run-retention', timestamp: 1_000 }));
    await adapter.recordResourceSample(persistedSample({ runId: 'run-retention', timestamp: 2_000 }));

    await expect(adapter.deleteResourceSamplesBefore(1_500)).resolves.toBe(1);
    await expect(adapter.queryResourceSamples({ runId: 'run-retention' })).resolves.toEqual([
      persistedSample({ runId: 'run-retention', timestamp: 2_000 }),
    ]);

    await adapter.close();
  });
});
