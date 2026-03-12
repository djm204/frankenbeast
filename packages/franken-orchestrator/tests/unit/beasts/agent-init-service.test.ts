import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { AgentInitService } from '../../../src/beasts/services/agent-init-service.js';

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
      config: { goal: 'Map the lifecycle' },
    });
    const detail = agents.getAgentDetail(agent.id);

    expect(agent.chatSessionId).toBe('sess-1');
    expect(agent.initAction.command).toBe('/interview');
    expect(detail.events.map((event) => event.type)).toEqual([
      'agent.created',
      'agent.chat.bound',
      'agent.command.sent',
    ]);
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
      initConfig: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
    });

    const run = await init.dispatchAgent(agent.id, {
      definitionId: 'chunk-plan',
      chatSessionId: 'sess-1',
      config: {
        designDocPath: 'docs/plans/design.md',
        outputDir: 'docs/chunks',
      },
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
    });
    expect(run.id).toBe('run-123');
    expect(detail.events.map((event) => event.type)).toContain('agent.dispatch.requested');
  });
});
