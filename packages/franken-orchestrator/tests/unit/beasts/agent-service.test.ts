import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';

describe('AgentService', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('blocks low-risk role manifests from requesting mutation tools before tracking a run', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const securityLog: unknown[] = [];
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z', {
      toolPolicyLogger: (entry) => securityLog.push(entry),
    });

    expect(() => service.createAgent({
      definitionId: 'fallback-ticket-manager',
      source: 'cli',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'ticket-manager',
        config: {},
      },
      initConfig: {
        agentRole: 'ticket-manager',
        requestedTools: ['read_file', 'patch', 'terminal.background'],
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(service.listAgents()).toEqual([]);
    expect(securityLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'ticket-manager',
        requestedTool: 'patch',
        reason: expect.stringContaining('not allowed'),
      }),
      expect.objectContaining({
        role: 'ticket-manager',
        requestedTool: 'terminal.background',
        reason: expect.stringContaining('not allowed'),
      }),
    ]));
  });

  it('fails closed for unknown roles, missing roles, missing manifests, and merged alias denials', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const securityLog: unknown[] = [];
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z', {
      toolPolicyLogger: (entry) => securityLog.push(entry),
      trustedSkillToolManifests: { 'repo-writer': ['patch'] },
    });

    expect(() => service.createAgent({
      definitionId: 'fallback-issue-worker',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'issue-worker', config: {} },
      initConfig: {
        agentRole: 'issue-worker',
        requestedTools: ['patch'],
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-ticket-manager',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
      initConfig: {
        requestedTools: ['patch'],
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-ticket-manager',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
      initConfig: {
        agentRole: 'ticket-manager',
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-ticket-manager',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
      initConfig: {
        agentRole: 'ticket-manager',
        requestedTools: ['read_file'],
        tools: ['patch'],
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-constructor-role',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'constructor-role', config: {} },
      initConfig: {
        agentRole: 'constructor',
        requestedTools: ['read_file'],
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-no-manifest',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'no-manifest', config: {} },
      initConfig: {},
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-ticket-manager',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
      initConfig: {
        agentRole: 'ticket-manager',
        requestedTools: ['read_file'],
        skills: ['repo-writer'],
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(() => service.createAgent({
      definitionId: 'fallback-ticket-manager',
      source: 'cli',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
      initConfig: {
        agentRole: 'ticket-manager',
        requestedTools: ['read_file'],
        skills: ['repo-writer'],
        skillToolManifests: { 'repo-writer': ['patch'] },
      },
    })).toThrow(/least-privilege tool manifest denied/i);

    expect(service.listAgents()).toEqual([]);
    expect(securityLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'issue-worker',
        requestedTool: 'patch',
        reason: expect.stringContaining('not recognized'),
      }),
      expect.objectContaining({
        role: '<missing-role>',
        requestedTool: 'patch',
        reason: expect.stringContaining('must include a role'),
      }),
      expect.objectContaining({
        role: 'ticket-manager',
        requestedTool: '<missing-tool-manifest>',
        reason: expect.stringContaining('explicit least-privilege tool manifest'),
      }),
      expect.objectContaining({
        role: 'ticket-manager',
        requestedTool: 'patch',
        reason: expect.stringContaining('not allowed'),
      }),
      expect.objectContaining({
        role: 'constructor',
        requestedTool: 'read_file',
        reason: expect.stringContaining('not recognized'),
      }),
      expect.objectContaining({
        role: '<missing-role>',
        requestedTool: '<missing-tool-manifest>',
        reason: expect.stringContaining('explicit least-privilege tool manifest'),
      }),
      expect.objectContaining({
        role: 'ticket-manager',
        requestedTool: 'patch',
        reason: expect.stringContaining('not allowed'),
      }),
    ]));
  });

  it('emits structured default denial logs when no policy logger is injected', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');

    try {
      expect(() => service.createAgent({
        definitionId: 'fallback-ticket-manager',
        source: 'cli',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
        initConfig: {
          agentRole: 'ticket-manager',
          requestedTools: ['patch'],
        },
      })).toThrow(/least-privilege tool manifest denied/i);

      expect(warn).toHaveBeenCalledWith(
        '[agent-tool-policy-denial]',
        expect.stringContaining('"requestedTool":"patch"'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('allows coding, review, docs, triage, doctor, and ticket-manager requests that match role manifests', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z', {
      trustedSkillToolManifests: { 'read-only-context': ['read_file'] },
    });

    const roleRequests = [
      ['coding', ['read_file', 'write_file', 'patch', 'terminal', 'terminal.background']],
      ['review', ['read_file', 'search_files', 'terminal', 'github.read', 'github.comment']],
      ['docs', ['read_file', 'search_files', 'write_file', 'github.pr']],
      ['triage', ['read_file', 'search_files', 'github.read', 'kanban.comment']],
      ['doctor', ['read_file', 'search_files', 'terminal', 'github.read', 'kanban.comment']],
      ['ticket-manager', ['read_file', 'search_files', 'github.read', 'github.comment']],
    ] as const;

    for (const [agentRole, requestedTools] of roleRequests) {
      service.createAgent({
        definitionId: `${agentRole}-lane`,
        source: 'api',
        createdByUser: 'operator',
        initAction: {
          kind: 'martin-loop',
          command: `${agentRole} lane`,
          config: {},
        },
        initConfig: {
          agentRole,
          requestedTools,
          skills: ['read-only-context'],
          skillToolManifests: { 'read-only-context': ['read_file'] },
        },
      });
    }

    expect(service.listAgents()).toHaveLength(roleRequests.length);
  });

  it('creates tracked agents and lists them newest first', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const timestamps = [
      '2026-03-11T00:00:00.000Z',
      '2026-03-11T00:00:01.000Z',
    ];
    const service = new AgentService(repository, () => timestamps.shift() ?? '2026-03-11T00:00:02.000Z');

    const first = service.createAgent({
      definitionId: 'design-interview',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'design-interview',
        command: '/interview',
        config: { goal: 'First' },
        chatSessionId: 'sess-1',
      },
      initConfig: { goal: 'First', agentRole: 'docs', requestedTools: ['read_file', 'write_file'], skills: [] },
      chatSessionId: 'sess-1',
    });
    const second = service.createAgent({
      definitionId: 'martin-loop',
      source: 'cli',
      createdByUser: 'pfk',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: { chunkDirectory: 'docs/chunks' },
      },
      initConfig: { chunkDirectory: 'docs/chunks', agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'], skills: [] },
    });

    expect(first.status).toBe('initializing');
    expect(service.listAgents().map((agent) => agent.id)).toEqual([second.id, first.id]);
  });

  it('returns tracked agent detail with init events and linked run id', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');

    const agent = service.createAgent({
      definitionId: 'chunk-plan',
      source: 'chat',
      createdByUser: 'chat-session:sess-1',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/design.md', agentRole: 'docs', requestedTools: ['read_file', 'write_file'], skills: [] },
      chatSessionId: 'sess-1',
    });

    const event = service.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.command.sent',
      message: 'Sent planning command',
      payload: { sessionId: 'sess-1' },
    });
    const run = repository.createRun({
      definitionId: 'chunk-plan',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        designDocPath: 'docs/plans/design.md',
        outputDir: 'docs/chunks',
      },
      dispatchedBy: 'chat',
      dispatchedByUser: 'chat-session:sess-1',
      createdAt: '2026-03-11T00:00:01.000Z',
    });
    const linked = service.linkRun(agent.id, run.id);
    const detail = service.getAgentDetail(agent.id);

    expect(event.sequence).toBe(1);
    expect(linked.dispatchRunId).toBe(run.id);
    expect(detail.agent.dispatchRunId).toBe(run.id);
    expect(detail.events).toEqual([event]);
  });

  it('preserves tracked worktree state when soft-deleting a stopped agent', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const worktreePath = join(workDir, '.frankenbeast', '.worktrees', 'agent-cleanup');
    mkdirSync(worktreePath, { recursive: true });

    const agent = service.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: { chunkDirectory: 'docs/chunks' },
      },
      initConfig: { chunkDirectory: 'docs/chunks', agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'], skills: [] },
    });
    const run = repository.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-11T00:00:00.000Z',
    });
    repository.createAttempt(run.id, {
      status: 'stopped',
      executorMetadata: {
        worktreeIsolation: true,
        worktreePath,
        worktreeBranch: 'beast/agent-cleanup',
        worktreeAgentId: 'agent-cleanup',
        worktreeProjectRoot: workDir,
      },
    });
    service.linkRun(agent.id, run.id);
    service.updateAgent(agent.id, { status: 'stopped' });

    service.softDeleteAgent(agent.id);

    expect(existsSync(worktreePath)).toBe(true);
  });

  it('keeps soft-deleted tracked agents available for list and detail audit views', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-service-'));
    const repository = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');

    const agent = service.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: { chunkDirectory: 'docs/chunks' },
      },
      initConfig: { chunkDirectory: 'docs/chunks', agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal'], skills: [] },
    });

    service.updateAgent(agent.id, { status: 'stopped' });
    service.softDeleteAgent(agent.id);

    expect(service.listAgents().map(({ id, status }) => ({ id, status }))).toEqual([
      { id: agent.id, status: 'deleted' },
    ]);
    expect(service.getAgent(agent.id).status).toBe('deleted');
    expect(() => service.getMutableAgent(agent.id)).toThrow(`Tracked agent '${agent.id}' has been deleted`);
  });
});
