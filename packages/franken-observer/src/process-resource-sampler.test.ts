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

    await adapter.close();
  });
});
