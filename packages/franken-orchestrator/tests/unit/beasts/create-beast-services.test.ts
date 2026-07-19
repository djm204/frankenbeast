import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const processExecutorConstructor = vi.hoisted(() => vi.fn());

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
        initConfig: { labels: ['feature'], agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'], skills: [] },
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

  it('loads installed skill tool manifests for tracked-agent validation and dispatch', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const skillDir = join(tempDir, '.fbeast', 'skills', 'context-only');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'context-only': { command: 'context-only' } } }),
    );
    await writeFile(
      join(skillDir, 'tools.json'),
      JSON.stringify([{ name: 'read_file', description: 'Read context', inputSchema: {} }]),
    );
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
          requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'],
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
          requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'],
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
          requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'],
          skills: ['manifestless'],
        },
      })).toThrow(/coding:skill:manifestless/);
    } finally {
      services.dispose();
    }
  });
});
