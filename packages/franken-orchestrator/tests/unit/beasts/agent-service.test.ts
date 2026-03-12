import { afterEach, describe, expect, it } from 'vitest';
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
      initConfig: { goal: 'First' },
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
      initConfig: { chunkDirectory: 'docs/chunks' },
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
      initConfig: { designDocPath: 'docs/plans/design.md' },
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

  it('hides soft-deleted tracked agents from list and detail lookups', async () => {
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
      initConfig: { chunkDirectory: 'docs/chunks' },
    });

    service.updateAgent(agent.id, { status: 'stopped' });
    service.softDeleteAgent(agent.id);

    expect(service.listAgents()).toEqual([]);
    expect(() => service.getAgent(agent.id)).toThrow(`Unknown tracked agent: ${agent.id}`);
  });
});
