import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../../src/beasts/events/beast-log-store.js';
import { martinLoopDefinition } from '../../../../src/beasts/definitions/martin-loop-definition.js';
import { ProcessBeastExecutor } from '../../../../src/beasts/execution/process-beast-executor.js';
import { SQLiteBeastRepository } from '../../../../src/beasts/repository/sqlite-beast-repository.js';
import { RunConfigSchema } from '../../../../src/cli/run-config-loader.js';
import type { ProcessCallbacks } from '../../../../src/beasts/execution/process-supervisor.js';

function createSupervisorMock() {
  return {
    spawn: vi.fn(async (_spec: unknown, _callbacks: unknown) => ({ pid: 4242 })),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };
}

describe('Config file passthrough', () => {
  let workDir: string | undefined;
  let configFilePaths: string[] = [];

  afterEach(async () => {
    // Clean up any config files written to cwd
    for (const p of configFilePaths) {
      try { if (existsSync(p)) { const { unlinkSync } = await import('node:fs'); unlinkSync(p); } } catch {}
    }
    configFilePaths = [];
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('writes configSnapshot to JSON file and sets FRANKENBEAST_RUN_CONFIG in spawned env', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'config-passthrough-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);

    const configSnapshot = {
      provider: 'claude',
      objective: 'Test passthrough',
      chunkDirectory: '/tmp/chunks',
    };

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot,
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-16T00:00:00.000Z',
    });

    await executor.start(run, martinLoopDefinition);

    // Verify supervisor.spawn was called with FRANKENBEAST_RUN_CONFIG in env
    const [spawnSpec] = supervisor.spawn.mock.calls[0];
    const spec = spawnSpec as { env?: Record<string, string> };
    expect(spec.env).toBeDefined();
    expect(spec.env!['FRANKENBEAST_RUN_CONFIG']).toBeDefined();

    const configFilePath = spec.env!['FRANKENBEAST_RUN_CONFIG']!;
    configFilePaths.push(configFilePath);

    // Config file should exist under cwd/.fbeast/.build/run-configs/
    expect(existsSync(configFilePath)).toBe(true);
    expect(configFilePath).toContain('.fbeast');
    expect(configFilePath).toContain('run-configs');

    // Config file content should match the configSnapshot
    const written = JSON.parse(readFileSync(configFilePath, 'utf-8'));
    expect(written).toEqual(configSnapshot);
  });

  it('cleans up config file after process exits successfully', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'config-passthrough-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);

    const configSnapshot = {
      provider: 'claude',
      objective: 'Test cleanup',
      chunkDirectory: '/tmp/chunks',
    };

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot,
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-16T00:00:00.000Z',
    });

    await executor.start(run, martinLoopDefinition);

    // Get config file path
    const [spawnSpec] = supervisor.spawn.mock.calls[0];
    const spec = spawnSpec as { env?: Record<string, string> };
    const configFilePath = spec.env!['FRANKENBEAST_RUN_CONFIG']!;
    configFilePaths.push(configFilePath);

    // Verify file exists before exit
    expect(existsSync(configFilePath)).toBe(true);

    // Trigger process exit
    const [, callbacks] = supervisor.spawn.mock.calls[0];
    const cb = callbacks as ProcessCallbacks;
    cb.onExit(0, null);

    // Config file should be cleaned up
    expect(existsSync(configFilePath)).toBe(false);
  });

  it('round-trip: written configSnapshot passes Zod validation via RunConfigSchema', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'config-passthrough-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);

    const configSnapshot = {
      provider: 'claude',
      objective: 'Round-trip test',
      chunkDirectory: '/tmp/chunks',
      modules: { firewall: true, skills: false },
    };

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot,
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-16T00:00:00.000Z',
    });

    await executor.start(run, martinLoopDefinition);

    const [spawnSpec] = supervisor.spawn.mock.calls[0];
    const spec = spawnSpec as { env?: Record<string, string> };
    const configFilePath = spec.env!['FRANKENBEAST_RUN_CONFIG']!;
    configFilePaths.push(configFilePath);

    // Simulate what spawned process does: read file and validate with RunConfigSchema
    const fileContent = readFileSync(configFilePath, 'utf-8');
    const parsed = RunConfigSchema.parse(JSON.parse(fileContent));

    expect(parsed.provider).toBe('claude');
    expect(parsed.objective).toBe('Round-trip test');
    expect(parsed.modules).toEqual({ firewall: true, skills: false });
  });

  it('round-trip: validates model, maxDurationMs, and skills fields from spec', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'config-passthrough-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);

    const configSnapshot = {
      provider: 'claude',
      objective: 'Spec fields test',
      model: 'claude-sonnet-4-6',
      maxDurationMs: 300_000,
      skills: ['code-review', 'testing'],
    };

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot,
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-16T00:00:00.000Z',
    });

    await executor.start(run, martinLoopDefinition);

    const [spawnSpec] = supervisor.spawn.mock.calls[0];
    const spec = spawnSpec as { env?: Record<string, string> };
    const configFilePath = spec.env!['FRANKENBEAST_RUN_CONFIG']!;
    configFilePaths.push(configFilePath);

    const fileContent = readFileSync(configFilePath, 'utf-8');
    const parsed = RunConfigSchema.parse(JSON.parse(fileContent));

    expect(parsed.model).toBe('claude-sonnet-4-6');
    expect(parsed.maxDurationMs).toBe(300_000);
    expect(parsed.skills).toEqual(['code-review', 'testing']);
  });

  it('cleans up config file after process exits with failure', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'config-passthrough-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = createSupervisorMock();
    const executor = new ProcessBeastExecutor(repo, logs, supervisor);

    const configSnapshot = {
      provider: 'claude',
      objective: 'Test failure cleanup',
      chunkDirectory: '/tmp/chunks',
    };

    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot,
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-16T00:00:00.000Z',
    });

    await executor.start(run, martinLoopDefinition);

    const [spawnSpec] = supervisor.spawn.mock.calls[0];
    const spec = spawnSpec as { env?: Record<string, string> };
    const configFilePath = spec.env!['FRANKENBEAST_RUN_CONFIG']!;
    configFilePaths.push(configFilePath);

    expect(existsSync(configFilePath)).toBe(true);

    // Trigger failed exit
    const [, callbacks] = supervisor.spawn.mock.calls[0];
    const cb = callbacks as ProcessCallbacks;
    cb.onExit(1, null);

    // Config file should still be cleaned up on failure
    expect(existsSync(configFilePath)).toBe(false);
  });
});
