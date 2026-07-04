import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatRuntimeResult, ChatRuntimeState } from '../../../src/chat/runtime.js';
import { ChatRuntimeCommsAdapter } from '../../../src/comms/core/chat-runtime-comms-adapter.js';

function mockRuntime() {
  return {
    run: vi.fn<[string, ChatRuntimeState], Promise<ChatRuntimeResult>>().mockResolvedValue({
      displayMessages: [{ kind: 'reply', content: 'Hello from runtime' }],
      events: [],
      pendingApproval: false,
      state: 'active',
      tier: null,
      transcript: [
        { role: 'user', content: 'ping', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Hello from runtime', timestamp: new Date().toISOString() },
      ],
    }),
  };
}

function mockSessionStore() {
  const sessions = new Map<string, Record<string, unknown>>();
  return {
    load: vi.fn(async (id: string) => sessions.get(id) ?? null),
    create: vi.fn(async (id: string, data: Record<string, unknown>) => {
      const session = {
        sessionId: id,
        projectId: 'default',
        transcript: [],
        state: 'active',
        ...data,
      };
      sessions.set(id, session);
      return session;
    }),
    save: vi.fn(async (id: string, data: Record<string, unknown>) => {
      sessions.set(id, data);
    }),
    _sessions: sessions,
  };
}

describe('ChatRuntimeCommsAdapter', () => {
  let runtime: ReturnType<typeof mockRuntime>;
  let store: ReturnType<typeof mockSessionStore>;
  let adapter: ChatRuntimeCommsAdapter;

  beforeEach(() => {
    runtime = mockRuntime();
    store = mockSessionStore();
    adapter = new ChatRuntimeCommsAdapter(runtime as any, store as any);
  });

  it('calls runtime.run() with correct input', async () => {
    await adapter.processInbound({
      sessionId: 'sess-1',
      channelType: 'slack',
      text: 'deploy to staging',
      externalUserId: 'U123',
    });

    expect(runtime.run).toHaveBeenCalledWith(
      'deploy to staging',
      expect.objectContaining({ sessionId: 'sess-1' }),
    );
  });

  it('creates session if not found in store', async () => {
    await adapter.processInbound({
      sessionId: 'new-sess',
      channelType: 'slack',
      text: 'hello',
      externalUserId: 'U123',
    });

    expect(store.create).toHaveBeenCalledWith(
      'new-sess',
      expect.objectContaining({ channelType: 'slack' }),
    );
  });

  it('loads existing session from store', async () => {
    store._sessions.set('existing', {
      sessionId: 'existing',
      projectId: 'proj-1',
      transcript: [{ role: 'user', content: 'prior', timestamp: '2026-01-01' }],
      state: 'active',
    });

    await adapter.processInbound({
      sessionId: 'existing',
      channelType: 'slack',
      text: 'followup',
      externalUserId: 'U123',
    });

    expect(store.create).not.toHaveBeenCalled();
    expect(runtime.run).toHaveBeenCalledWith(
      'followup',
      expect.objectContaining({
        sessionId: 'existing',
        projectId: 'proj-1',
      }),
    );
  });

  it('persists updated transcript after runtime call', async () => {
    await adapter.processInbound({
      sessionId: 'sess-1',
      channelType: 'slack',
      text: 'hello',
      externalUserId: 'U123',
    });

    expect(store.save).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        transcript: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: 'Hello from runtime' }),
        ]),
      }),
    );
  });

  it('maps display message to comms outbound format', async () => {
    const result = await adapter.processInbound({
      sessionId: 'sess-1',
      channelType: 'slack',
      text: 'ping',
      externalUserId: 'U123',
    });

    expect(result.text).toBe('Hello from runtime');
    expect(result.status).toBe('reply');
  });

  it('returns empty text when no display messages', async () => {
    runtime.run.mockResolvedValue({
      displayMessages: [],
      events: [],
      pendingApproval: false,
      state: 'active',
      tier: null,
      transcript: [],
    });

    const result = await adapter.processInbound({
      sessionId: 'sess-1',
      channelType: 'slack',
      text: 'ping',
      externalUserId: 'U123',
    });

    expect(result.text).toBe('');
  });

  it('adds approval buttons when runtime returns pendingApproval', async () => {
    runtime.run.mockResolvedValue({
      displayMessages: [{ kind: 'approval', content: 'Run dangerous command?' }],
      events: [],
      pendingApproval: true,
      pendingApprovalDescription: 'rm -rf /',
      state: 'pending_approval',
      tier: null,
      transcript: [],
    });

    const result = await adapter.processInbound({
      sessionId: 'sess-1',
      channelType: 'slack',
      text: '/run dangerous',
      externalUserId: 'U123',
    });

    expect(result.status).toBe('approval');
    expect(result.actions).toEqual([
      { id: 'approve', label: 'Approve', style: 'primary' },
      { id: 'reject', label: 'Reject', style: 'danger' },
    ]);
    expect(store.save).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        pendingApproval: expect.objectContaining({
          description: 'rm -rf /',
          requestedAt: expect.any(String),
        }),
      }),
    );
  });

  it('preserves existing pending approval metadata when a status turn remains pending', async () => {
    const pendingApproval = { description: 'deploy production', requestedAt: '2026-03-10T00:00:00.000Z' };
    store._sessions.set('pending-sess', {
      sessionId: 'pending-sess',
      projectId: 'proj-1',
      transcript: [],
      state: 'pending_approval',
      pendingApproval,
    });
    runtime.run.mockResolvedValue({
      displayMessages: [{ kind: 'reply', content: 'Still waiting for approval' }],
      events: [],
      pendingApproval: true,
      state: 'pending_approval',
      tier: null,
      transcript: [],
    });

    await adapter.processInbound({
      sessionId: 'pending-sess',
      channelType: 'slack',
      text: '/status',
      externalUserId: 'U123',
    });

    expect(store.save).toHaveBeenCalledWith(
      'pending-sess',
      expect.objectContaining({ pendingApproval }),
    );
  });

  it('normalizes and persists channel routing metadata for Slack and Discord adapters', async () => {
    const result = await adapter.processInbound({
      sessionId: 'route-sess',
      channelType: 'slack',
      text: 'hello',
      externalUserId: 'U123',
      metadata: {
        externalChannelId: 'C123',
        externalThreadId: '171234.000100',
      },
    });

    expect(result.metadata).toEqual(expect.objectContaining({
      externalChannelId: 'C123',
      externalThreadId: '171234.000100',
      channelId: 'C123',
      threadTs: '171234.000100',
      threadId: '171234.000100',
    }));
    expect(store.save).toHaveBeenCalledWith(
      'route-sess',
      expect.objectContaining({
        routingMetadata: expect.objectContaining({ channelId: 'C123', threadTs: '171234.000100' }),
      }),
    );
  });

  it('reuses stored routing metadata when processing follow-up channel actions', async () => {
    store._sessions.set('route-sess', {
      sessionId: 'route-sess',
      projectId: 'proj-1',
      transcript: [],
      state: 'pending_approval',
      routingMetadata: {
        externalChannelId: 'C123',
        externalThreadId: '171234.000100',
        channelId: 'C123',
        threadTs: '171234.000100',
      },
    });

    const result = await adapter.processInbound({
      sessionId: 'route-sess',
      channelType: 'slack',
      text: '/approve',
      externalUserId: 'system',
    });

    expect(result.metadata).toEqual(expect.objectContaining({ channelId: 'C123', threadTs: '171234.000100' }));
  });

  it('persists explicit null beast context returned by the runtime', async () => {
    store._sessions.set('beast-sess', {
      sessionId: 'beast-sess',
      projectId: 'proj-1',
      transcript: [],
      state: 'active',
      beastContext: { definitionId: 'martin-loop', interviewSessionId: 'interview-1', status: 'interviewing' },
    });
    runtime.run.mockResolvedValue({
      displayMessages: [{ kind: 'reply', content: 'started run' }],
      events: [],
      pendingApproval: false,
      state: 'active',
      tier: null,
      transcript: [],
      beastContext: null,
    });

    await adapter.processInbound({
      sessionId: 'beast-sess',
      channelType: 'slack',
      text: 'ship it',
      externalUserId: 'U123',
    });

    expect(store.save).toHaveBeenCalledWith(
      'beast-sess',
      expect.objectContaining({ beastContext: null }),
    );
  });

  it('does not add approval buttons when not pending', async () => {
    const result = await adapter.processInbound({
      sessionId: 'sess-1',
      channelType: 'slack',
      text: 'normal message',
      externalUserId: 'U123',
    });

    expect(result.actions).toBeUndefined();
  });
});
