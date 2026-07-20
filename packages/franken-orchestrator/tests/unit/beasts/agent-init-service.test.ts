import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { AgentInitService } from '../../../src/beasts/services/agent-init-service.js';
import { MaintenanceModeError } from '../../../src/beasts/services/maintenance-mode-service.js';
import { AgentToolPolicyError } from '../../../src/beasts/services/role-tool-manifest.js';

describe('AgentInitService', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('creates tracked agents for chat-backed init actions and persists session linkage', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-init-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const init = new AgentInitService(agents, {
      createRun: vi.fn(),
    } as never, () => '2026-03-11T00:00:00.000Z');

    const agent = init.createChatInitAgent({
      definitionId: 'design-interview',
      chatSessionId: 'sess-1',
      command: '/interview',
      initActionKind: 'design-interview',
      config: { goal: 'Map the lifecycle', agentRole: 'docs', requestedTools: ['read_file', 'search_files', 'write_file'], skills: [] },
    });
    const detail = agents.getAgentDetail(agent.id);

    expect(agent.chatSessionId).toBe('sess-1');
    expect(agent.initAction.command).toBe('/interview');
    expect(agent.initConfig).toMatchObject({
      agentRole: 'docs',
      requestedTools: ['read_file', 'search_files', 'write_file'],
      skills: [],
    });
    expect(detail.events.map((event) => event.type)).toEqual([
      'agent.created',
      'agent.chat.bound',
      'agent.command.sent',
    ]);
  });

  it('derives explicit policy fields for empty chat init shells while interviews collect config', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-init-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const init = new AgentInitService(agents, {
      createRun: vi.fn(),
    } as never, () => '2026-03-11T00:00:00.000Z');

    const agent = init.createChatInitAgent({
      definitionId: 'martin-loop',
      chatSessionId: 'sess-empty',
      command: 'martin-loop',
      initActionKind: 'martin-loop',
      config: {},
    });

    expect(agent.initConfig).toMatchObject({
      agentRole: 'coding',
      requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'],
      skills: [],
    });
    expect(agents.getAgent(agent.id).status).toBe('initializing');
  });

  it('includes trusted selected-skill capabilities in chat init defaults', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-init-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z', {
      trustedSkillToolManifests: { github: ['get_issue'] },
    });
    const init = new AgentInitService(agents, {
      createRun: vi.fn(),
    } as never, () => '2026-03-11T00:00:00.000Z');

    const agent = init.createChatInitAgent({
      definitionId: 'chunk-plan',
      chatSessionId: 'sess-skilled',
      command: 'chunk-plan',
      initActionKind: 'chunk-plan',
      config: { skills: ['github'] },
    });

    expect(agent.initConfig).toMatchObject({
      agentRole: 'docs',
      requestedTools: ['read_file', 'search_files', 'write_file', 'github.read'],
      skills: ['github'],
    });
  });

  it('dispatches tracked agents after init completes and links the resulting run', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-init-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const createRun = vi.fn().mockResolvedValue({
      id: 'run-123',
      definitionId: 'chunk-plan',
      status: 'running',
      trackedAgentId: 'agent-1',
    });
    const init = new AgentInitService(agents, {
      createRun,
    } as never, () => '2026-03-11T00:00:00.000Z');

    const agent = agents.createAgent({
      definitionId: 'chunk-plan',
      source: 'chat',
      createdByUser: 'chat-session:sess-1',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/design.md', agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'], skills: [] },
      chatSessionId: 'sess-1',
    });

    const run = await init.dispatchAgent(agent.id, {
      definitionId: 'chunk-plan',
      chatSessionId: 'sess-1',
      config: {
        designDocPath: 'docs/plans/design.md',
        outputDir: 'docs/chunks',
      },
      executionMode: 'container',
    });
    const detail = agents.getAgentDetail(agent.id);

    expect(createRun).toHaveBeenCalledWith({
      definitionId: 'chunk-plan',
      config: {
        designDocPath: 'docs/plans/design.md',
        outputDir: 'docs/chunks',
      },
      dispatchedBy: 'chat',
      dispatchedByUser: 'chat-session:sess-1',
      trackedAgentId: agent.id,
      startNow: true,
      executionMode: 'container',
    });
    expect(run.id).toBe('run-123');
    expect(detail.events.map((event) => event.type)).toContain('agent.dispatch.requested');
  });

  it('marks chat-created agents stopped when maintenance blocks dispatch', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-init-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const createRun = vi.fn().mockRejectedValue(new MaintenanceModeError({
      enabled: true,
      reason: 'deploy',
      allowedCommands: ['status'],
    }));
    const init = new AgentInitService(agents, {
      createRun,
    } as never, () => '2026-03-11T00:00:00.000Z');

    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'chat',
      createdByUser: 'chat-session:sess-1',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {}, chatSessionId: 'sess-1' },
      initConfig: { provider: 'claude', objective: 'ship', agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'], skills: [] },
      chatSessionId: 'sess-1',
    });

    await expect(init.dispatchAgent(agent.id, {
      definitionId: 'martin-loop',
      chatSessionId: 'sess-1',
      config: { provider: 'claude', objective: 'ship' },
      executionMode: 'process',
    })).rejects.toThrow(MaintenanceModeError);

    const detail = agents.getAgentDetail(agent.id);
    expect(detail.agent.status).toBe('stopped');
    expect(detail.events.map((event) => event.type)).toContain('agent.dispatch.paused');
  });

  it('marks chat-created agents stopped when tool policy blocks dispatch', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-init-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const validation = {
      allowed: false,
      role: 'docs' as const,
      rawRole: 'docs',
      requestedTools: ['terminal'],
      denials: [{ role: 'docs' as const, requestedTool: 'terminal', reason: 'not allowed' }],
    };
    const init = new AgentInitService(agents, {
      createRun: vi.fn().mockRejectedValue(new AgentToolPolicyError(validation)),
    } as never, () => '2026-03-11T00:00:00.000Z');
    const agent = agents.createAgent({
      definitionId: 'design-interview',
      source: 'chat',
      createdByUser: 'chat-session:sess-policy',
      initAction: { kind: 'design-interview', command: '/interview', config: {}, chatSessionId: 'sess-policy' },
      initConfig: { agentRole: 'docs', requestedTools: ['read_file', 'write_file'], skills: [] },
      chatSessionId: 'sess-policy',
    });

    await expect(init.dispatchAgent(agent.id, {
      definitionId: 'design-interview',
      chatSessionId: 'sess-policy',
      config: {},
    })).rejects.toThrow(AgentToolPolicyError);

    const detail = agents.getAgentDetail(agent.id);
    expect(detail.agent.status).toBe('stopped');
    expect(detail.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'agent.dispatch.denied',
        payload: { validation },
      }),
    ]));
  });
});
