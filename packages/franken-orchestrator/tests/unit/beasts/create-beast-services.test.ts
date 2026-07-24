import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
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

  it('resolves persisted brain paths and module faculty flags from the latest run', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const beastsDb = join(tempDir, 'beast.db');
    const customDbPath = join(tempDir, 'custom-brain.db');
    const repo = new SQLiteBeastRepository(beastsDb);
    repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        brain: { dbPath: customDbPath },
        modules: { planner: true, critique: true, governor: false, memory: true },
      },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-24T10:00:00.000Z',
    });
    repo.createRun({
      definitionId: 'default-modules',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-24T10:01:00.000Z',
    });
    repo.createTrackedAgent({
      definitionId: 'default-modules',
      source: 'api',
      status: 'completed',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'run', config: {} },
      initConfig: {},
      moduleConfig: { planner: false, critique: false, governor: false },
      createdAt: '2026-07-24T09:00:00.000Z',
      updatedAt: '2026-07-24T09:00:00.000Z',
    });
    const corruptUnrelatedRun = repo.createRun({
      definitionId: 'unrelated',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { unrelated: true },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-24T10:02:00.000Z',
    });
    const worktreeRun = repo.createRun({
      definitionId: 'worktree-path',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { brain: { dbPath: '.fbeast/brains/custom.db' } },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-24T10:03:00.000Z',
    });
    const worktreeExecutionCwd = join(tempDir, '.worktrees', 'agent-1');
    repo.createAttempt(worktreeRun.id, {
      status: 'running',
      startedAt: '2026-07-24T10:03:01.000Z',
      executorMetadata: { worktreeExecutionCwd },
    });
    repo.close();
    const rawDb = new Database(beastsDb);
    rawDb.prepare('UPDATE beast_runs SET config_snapshot = ? WHERE id = ?')
      .run('{"corrupt":', corruptUnrelatedRun.id);
    rawDb.close();
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
    const services = createBeastServices({
      beastsDb,
      beastLogsDir: join(tempDir, 'logs'),
      root: tempDir,
      brainDbPath: join(tempDir, 'project-brain.db'),
    });

    try {
      expect(services.resolveBrainContext('martin-loop')).toEqual({
        dbPath: customDbPath,
        faculties: {
          planning: true,
          reasoning: true,
          action: false,
          learning: false,
        },
      });
      expect(services.resolveBrainContext('default-modules')).toEqual({
        dbPath: join(tempDir, 'project-brain.db'),
        faculties: {
          planning: true,
          reasoning: true,
          action: true,
          learning: false,
        },
      });
      expect(services.resolveBrainContext('worktree-path')).toMatchObject({
        dbPath: join(worktreeExecutionCwd, '.fbeast', 'brains', 'custom.db'),
      });
      expect(services.resolveBrainContext('unknown')).toBeUndefined();
    } finally {
      services.dispose();
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
        initConfig: { labels: ['feature'], agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'], skills: [] },
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

  it('loads default .fbeast skill manifests while ignoring an unrelated malformed manifest', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const skillsDir = join(tempDir, '.fbeast', 'skills');
    const skillDir = join(skillsDir, 'context-only');
    const brokenSkillDir = join(skillsDir, 'broken-unselected');
    await mkdir(skillDir, { recursive: true });
    await mkdir(brokenSkillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'context-only': { command: 'context-only' } } }),
    );
    await writeFile(
      join(skillDir, 'tools.json'),
      JSON.stringify([{ name: 'read_file', description: 'Read context', inputSchema: {} }]),
    );
    await writeFile(
      join(brokenSkillDir, 'mcp.json'),
      '{not-json',
    );
    await writeFile(join(brokenSkillDir, 'tools.json'), '{not-json');
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
    const services = createBeastServices({
      beastsDb: join(tempDir, 'beast.db'),
      beastLogsDir: join(tempDir, 'logs'),
      root: tempDir,
    });

    try {
      const agent = services.agents.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {
          provider: 'claude',
          objective: 'Use the selected context skill',
          chunkDirectory: 'docs/chunks',
          agentRole: 'coding',
          requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'],
          skills: ['context-only'],
        },
      });

      const run = await services.dispatch.createRun({
        definitionId: 'martin-loop',
        trackedAgentId: agent.id,
        config: {
          provider: 'claude',
          objective: 'Dispatch with selected context skill',
          chunkDirectory: 'docs/chunks',
          skills: ['context-only'],
        },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        executionMode: 'process',
      });

      expect(run.configSnapshot).toMatchObject({ skills: ['context-only'] });
      expect(processExecutorConstructor.mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      services.dispose();
    }
  });

  it('refreshes trusted skill tool manifests added after service construction', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const skillsDir = join(tempDir, 'dashboard-skills');
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
    const services = createBeastServices({
      beastsDb: join(tempDir, 'beast.db'),
      beastLogsDir: join(tempDir, 'logs'),
      root: tempDir,
      skillsDir,
    });

    try {
      const skillDir = join(skillsDir, 'late-context');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'mcp.json'),
        JSON.stringify({ mcpServers: { 'late-context': { command: 'late-context' } } }),
      );
      await writeFile(
        join(skillDir, 'tools.json'),
        JSON.stringify([{ name: 'read_file', description: 'Read context', inputSchema: {} }]),
      );

      const agent = services.agents.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {
          provider: 'claude',
          objective: 'Use a skill installed after startup',
          chunkDirectory: 'docs/chunks',
          agentRole: 'coding',
          requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'],
          skills: ['late-context'],
        },
      });

      const run = await services.dispatch.createRun({
        definitionId: 'martin-loop',
        trackedAgentId: agent.id,
        config: {
          provider: 'claude',
          objective: 'Dispatch after late skill install',
          chunkDirectory: 'docs/chunks',
          skills: ['late-context'],
        },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        executionMode: 'process',
      });

      expect(run.configSnapshot).toMatchObject({ skills: ['late-context'] });
    } finally {
      services.dispose();
    }
  });

  it('does not trust installed skills that omit an explicit tools manifest', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const skillDir = join(tempDir, 'skills', 'manifestless');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { manifestless: { command: 'manifestless' } } }),
    );
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
    const services = createBeastServices({
      beastsDb: join(tempDir, 'beast.db'),
      beastLogsDir: join(tempDir, 'logs'),
      root: tempDir,
    });

    try {
      expect(() => services.agents.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {
          provider: 'claude',
          objective: 'Use a manifestless skill',
          chunkDirectory: 'docs/chunks',
          agentRole: 'coding',
          requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'],
          skills: ['manifestless'],
        },
      })).toThrow(/coding:skill:manifestless/);
    } finally {
      services.dispose();
    }
  });
});
