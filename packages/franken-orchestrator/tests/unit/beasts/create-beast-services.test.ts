import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const processExecutorConstructor = vi.hoisted(() => vi.fn());
const cleanupAbandonedBeastWorktrees = vi.hoisted(() => vi.fn());

vi.mock('../../../src/beasts/execution/git-worktree-isolation.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/beasts/execution/git-worktree-isolation.js')>(),
  cleanupAbandonedBeastWorktrees,
}));

vi.mock('../../../src/beasts/execution/process-beast-executor.js', () => ({
  ProcessBeastExecutor: class ProcessBeastExecutorMock {
    readonly start = vi.fn();
    readonly stop = vi.fn();
    readonly kill = vi.fn();

    constructor(...args: unknown[]) {
      processExecutorConstructor(...args);
    }
  },
}));

describe('createBeastServices', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    delete process.env.FBEAST_AGENT_CAPACITY_TOTAL;
    delete process.env.FBEAST_AGENT_CAPACITY_RESERVATIONS;
    delete process.env.FBEAST_AGENT_CAPACITY_RELEASED_RESERVATIONS;
    processExecutorConstructor.mockClear();
    cleanupAbandonedBeastWorktrees.mockClear();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      tempDir = undefined;
    }
  });

  it('passes a run-config directory under the resolved project .fbeast build path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const parentCwd = join(tempDir, 'parent-cwd');
    const projectRoot = join(tempDir, 'target-project');
    const originalCwd = process.cwd();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(parentCwd, { recursive: true });
    await mkdir(projectRoot, { recursive: true });

    try {
      process.chdir(parentCwd);
      const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
      const services = createBeastServices({
        beastsDb: join(projectRoot, '.fbeast', 'beast.db'),
        beastLogsDir: join(projectRoot, '.fbeast', 'logs'),
        root: projectRoot,
      });

      const expectedRunConfigDir = join(resolve(projectRoot), '.fbeast', '.build', 'run-configs');
      const matchingCall = processExecutorConstructor.mock.calls.find(([, , , options]) => (
        options as { runConfigDir?: string } | undefined
      )?.runConfigDir === expectedRunConfigDir);
      expect(matchingCall).toBeDefined();
      const [, , supervisor, options] = matchingCall!;
      expect(options).toMatchObject({ runConfigDir: expectedRunConfigDir, runConfigRoot: resolve(projectRoot) });
      expect(supervisor).toMatchObject({ options: { projectRoot: resolve(projectRoot) } });

      services.dispose();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('persists SSE tickets in the Beast database across service restarts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const beastsDb = join(tempDir, 'beast.db');
    const paths = {
      beastsDb,
      beastLogsDir: join(tempDir, 'logs'),
      root: tempDir,
    };
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
    const firstServices = createBeastServices(paths);
    const ticket = firstServices.ticketStore.issue('operator-token-123');
    firstServices.dispose();

    const restartedServices = createBeastServices(paths);
    try {
      expect(restartedServices.ticketStore.consume(ticket, 'operator-token-123')).toBe('valid');
    } finally {
      restartedServices.dispose();
    }
  });

  it('starts but suppresses destructive worktree cleanup when persisted run JSON is corrupt', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const beastsDb = join(tempDir, 'beast.db');
    const repo = new SQLiteBeastRepository(beastsDb);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { healthy: true },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-20T00:00:00.000Z',
    });
    repo.close();
    const db = new Database(beastsDb);
    try {
      db.prepare('UPDATE beast_runs SET config_snapshot = ? WHERE id = ?')
        .run('{"token":"must-not-leak"', run.id);
    } finally {
      db.close();
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');

    const services = createBeastServices({
      beastsDb,
      beastLogsDir: join(tempDir, 'logs'),
      root: tempDir,
    });

    try {
      expect(cleanupAbandonedBeastWorktrees).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(
        `Skipping destructive Beast worktree cleanup because persisted JSON is corrupt in beast_runs.config_snapshot for row ${run.id}`,
      ));
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('must-not-leak'));
    } finally {
      services.dispose();
      warn.mockRestore();
    }
  });

  it('fails fast when reservation rules are configured without total capacity', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    process.env.FBEAST_AGENT_CAPACITY_RESERVATIONS = JSON.stringify([
      { id: 'security-urgent', slots: 1, labels: ['security'] },
    ]);
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');

    expect(() => createBeastServices({
      beastsDb: join(tempDir!, 'beast.db'),
      beastLogsDir: join(tempDir!, 'logs'),
      root: tempDir!,
    })).toThrow(/FBEAST_AGENT_CAPACITY_TOTAL is required/);
  });

  it('honors total capacity even when no reservation rules are configured', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    process.env.FBEAST_AGENT_CAPACITY_TOTAL = '1';
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
    const services = createBeastServices({
      beastsDb: join(tempDir!, 'beast.db'),
      beastLogsDir: join(tempDir!, 'logs'),
      root: tempDir!,
    });

    try {
      const agent = services.agents.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: { labels: ['feature'] },
      });
      services.agents.updateAgent(agent.id, { status: 'running' });

      expect(services.agents.canStartInitConfig({ labels: ['feature'] })).toEqual({
        allowed: false,
        reason: 'capacity_full',
        reservationId: undefined,
      });
    } finally {
      services.dispose();
    }
  });
});
