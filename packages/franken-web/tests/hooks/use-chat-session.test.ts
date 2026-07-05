import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChatSession } from '../../src/hooks/use-chat-session';

const mockCreateSession = vi.fn();
const mockGetSession = vi.fn();
const mockSendMessage = vi.fn();
const mockApprove = vi.fn();
const mockSocketUrl = vi.fn();

vi.mock('../../src/lib/api', () => ({
  ChatApiClient: vi.fn(function (this: {
    createSession: typeof mockCreateSession;
    getSession: typeof mockGetSession;
    sendMessage: typeof mockSendMessage;
    approve: typeof mockApprove;
    socketUrl: typeof mockSocketUrl;
  }) {
    this.createSession = mockCreateSession;
    this.getSession = mockGetSession;
    this.sendMessage = mockSendMessage;
    this.approve = mockApprove;
    this.socketUrl = mockSocketUrl;
  }),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  message(payload: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(payload) }),
    );
  }

  error() {
    this.onerror?.(new Event('error'));
  }

  shutdown() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }
}

vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

describe('useChatSession', () => {
  const opts = { baseUrl: 'http://localhost:3000', projectId: 'test-proj' };

  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.instances = [];
    mockCreateSession.mockResolvedValue({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [],
      state: 'active',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:00Z',
    });
    mockGetSession.mockResolvedValue({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [],
      state: 'active',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:00Z',
    });
    mockSendMessage.mockResolvedValue({
      outcome: { kind: 'reply', content: 'Fallback reply', modelTier: 'cheap' },
      tier: 'cheap',
      state: 'active',
    });
    mockApprove.mockResolvedValue({
      id: 'chat-1',
      approved: true,
      state: 'active',
    });
    mockSocketUrl.mockReturnValue('ws://localhost:3000/v1/chat/ws?sessionId=chat-1&token=signed-token');
  });

  afterEach(() => {
    MockWebSocket.instances = [];
  });

  it('creates a session and opens a websocket connection', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(mockCreateSession).toHaveBeenCalledWith('test-proj');
    expect(mockSocketUrl).toHaveBeenCalledWith('chat-1', 'signed-token');
    expect(MockWebSocket.instances[0]?.url).toBe(
      'ws://localhost:3000/v1/chat/ws?sessionId=chat-1&token=signed-token',
    );
  });

  it('streams assistant messages and updates receipts', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.open();
      socket.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [],
        state: 'active',
        pendingApproval: null,
      });
    });

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('Ship the dashboard shell');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.role).toBe('user');
    expect(result.current.messages[0]?.receipt).toBe('sending');

    const outbound = JSON.parse(socket.sent[0] ?? '{}') as { type: string; clientMessageId: string };
    expect(outbound.type).toBe('message.send');

    act(() => {
      socket.message({
        type: 'message.accepted',
        clientMessageId: outbound.clientMessageId,
        sessionId: 'chat-1',
        timestamp: '2026-03-09T00:00:01Z',
      });
    });
    expect(result.current.status).toBe('sending');

    act(() => {
      socket.message({
        type: 'message.delivered',
        clientMessageId: outbound.clientMessageId,
        timestamp: '2026-03-09T00:00:02Z',
      });
      socket.message({
        type: 'message.read',
        clientMessageId: outbound.clientMessageId,
        timestamp: '2026-03-09T00:00:03Z',
      });
      socket.message({
        type: 'assistant.typing.start',
        timestamp: '2026-03-09T00:00:04Z',
      });
      socket.message({
        type: 'assistant.message.delta',
        messageId: 'assistant-1',
        chunk: 'Working ',
        modelTier: 'premium_execution',
      });
      socket.message({
        type: 'assistant.message.delta',
        messageId: 'assistant-1',
        chunk: 'through it.',
        modelTier: 'premium_execution',
      });
      socket.message({
        type: 'assistant.message.complete',
        messageId: 'assistant-1',
        content: 'Working through it.',
        modelTier: 'premium_execution',
        timestamp: '2026-03-09T00:00:05Z',
      });
    });

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.receipt).toBe('read');
    expect(result.current.messages[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Working through it.',
      modelTier: 'premium_execution',
      streaming: false,
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('falls back to HTTP send when the websocket is not ready', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;

    await act(async () => {
      await result.current.send('Queue this until connected');
    });

    expect(mockSendMessage).toHaveBeenCalledWith('chat-1', 'Queue this until connected');
    expect(mockGetSession).toHaveBeenCalledWith('chat-1');
    expect(socket.sent).toHaveLength(0);
    expect(result.current.status).toBe('idle');
  });

  it('does not offer a retry when HTTP send succeeds but refresh fails', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    mockGetSession.mockRejectedValueOnce(new Error('refresh failed'));

    await act(async () => {
      await result.current.send('Already ran on the server');
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      content: 'Already ran on the server',
      receipt: 'accepted',
    }));
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({ receipt: 'failed' }));
  });

  it('drops unmatched optimistic HTTP sends after the server snapshot refreshes', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    mockGetSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [],
      state: 'active',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:07Z',
    });

    await act(async () => {
      await result.current.send('/status');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.status).toBe('idle');
  });

  it('surfaces pending approvals and sends approval responses over the socket', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.open();
      socket.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    expect(result.current.pendingApproval?.description).toBe('Deploy the generated fix');

    await act(async () => {
      await result.current.approve(true);
    });

    expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({
      type: 'approval.respond',
      approved: true,
    });
  });

  it('falls back to HTTP approval when the websocket is not ready', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    expect(result.current.pendingApproval?.description).toBe('Deploy the generated fix');

    await act(async () => {
      await result.current.approve(false);
    });

    expect(mockApprove).toHaveBeenCalledWith('chat-1', false);
    expect(mockGetSession).toHaveBeenCalledWith('chat-1');
    expect(socket.sent).toHaveLength(0);
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.approvalResolving).toBe(false);
    expect(result.current.approvalError).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('guards against duplicate approval submissions and exposes retryable HTTP failures', async () => {
    let rejectApproval: (error: Error) => void = () => undefined;
    mockApprove.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectApproval = reject;
    }));
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    act(() => {
      MockWebSocket.instances[0]!.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    void act(() => {
      void result.current.approve(true);
    });
    await waitFor(() => {
      expect(result.current.approvalResolving).toBe(true);
    });

    await act(async () => {
      await result.current.approve(false);
    });

    expect(mockApprove).toHaveBeenCalledTimes(1);
    act(() => rejectApproval(new Error('approval endpoint unavailable')));

    await waitFor(() => {
      expect(result.current.approvalResolving).toBe(false);
      expect(result.current.approvalError).toBe('approval endpoint unavailable');
      expect(result.current.pendingApproval?.description).toBe('Deploy the generated fix');
    });
  });

  it('clears approval resolving state after websocket interruption so users can retry', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    await act(async () => {
      await result.current.approve(true);
    });

    expect(socket.sent).toHaveLength(1);
    expect(result.current.approvalResolving).toBe(true);

    act(() => socket.shutdown());

    await waitFor(() => {
      expect(result.current.approvalResolving).toBe(false);
      expect(result.current.approvalError).toContain('Connection interrupted');
    });

    await act(async () => {
      await result.current.approve(false);
    });

    expect(mockApprove).toHaveBeenCalledWith('chat-1', false);
  });

  it('preserves streamed messages after HTTP approval fallback', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.message({
        type: 'assistant.message.delta',
        messageId: 'assistant-streamed',
        chunk: 'Ready to deploy',
        modelTier: 'cheap',
      });
      socket.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    mockGetSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [{
        id: 'server-assistant',
        role: 'assistant',
        content: 'Ready to deploy',
        timestamp: '2026-03-09T00:00:07Z',
      }],
      state: 'approved',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 1, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0.01,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:07Z',
    });

    await act(async () => {
      await result.current.approve(true);
    });

    expect(result.current.messages).toContainEqual(expect.objectContaining({
      content: 'Ready to deploy',
    }));
    expect(result.current.messages.filter((message) => message.content === 'Ready to deploy')).toHaveLength(1);
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.activity).toContainEqual(expect.objectContaining({
      type: 'turn.approval.resolved',
      data: { approved: true },
    }));
  });

  it('replaces equivalent REST snapshot messages in place', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [],
        state: 'active',
        pendingApproval: null,
      });
    });

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('Deploy the generated fix');
    });

    const outbound = JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string };
    act(() => {
      socket.message({
        type: 'message.accepted',
        clientMessageId: outbound.clientMessageId,
        timestamp: '2026-03-09T00:00:01Z',
      });
    });
    await act(async () => {
      await sendPromise;
    });

    act(() => {
      socket.message({
        type: 'assistant.message.delta',
        messageId: 'approval-prompt',
        chunk: 'Approve deployment?',
        modelTier: 'cheap',
      });
      socket.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
      socket.shutdown();
    });

    mockGetSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [{
        id: 'server-user',
        role: 'user',
        content: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:07Z',
      }],
      state: 'approved',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 1, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0.01,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:07Z',
    });

    await act(async () => {
      await result.current.approve(true);
    });

    expect(result.current.messages.map((message) => message.content)).toEqual([
      'Deploy the generated fix',
      'Approve deployment?',
    ]);
    expect(result.current.messages[0]?.id).toBe('server-user');
  });

  it('ignores stale session.ready after HTTP approval fallback', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.message({
        type: 'turn.approval.requested',
        description: 'Deploy the generated fix',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    mockGetSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [],
      state: 'approved',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 1, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0.01,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:07Z',
    });

    await act(async () => {
      await result.current.approve(true);
    });

    act(() => {
      socket.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [],
        state: 'active',
        pendingApproval: {
          description: 'Deploy the generated fix',
          requestedAt: '2026-03-09T00:00:06Z',
        },
      });
    });

    expect(result.current.pendingApproval).toBeNull();
  });

  it('resumes an existing session and reconnects when the socket closes', async () => {
    mockGetSession.mockResolvedValue({
      id: 'existing-sess',
      projectId: 'test-proj',
      transcript: [{ id: 'u1', role: 'user', content: 'old message', timestamp: '2026-03-09T00:00:00Z' }],
      state: 'active',
      pendingApproval: null,
      socketToken: 'resume-token',
      tokenTotals: { cheap: 5, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:00Z',
    });
    mockSocketUrl.mockReturnValue('ws://localhost:3000/v1/chat/ws?sessionId=existing-sess&token=resume-token');

    const { result } = renderHook(() =>
      useChatSession({ ...opts, sessionId: 'existing-sess' }),
    );

    await waitFor(() => {
      expect(result.current.sessionId).toBe('existing-sess');
    });

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.shutdown();
    });

    expect(mockGetSession).toHaveBeenCalledWith('existing-sess');
    expect(result.current.messages[0]?.content).toBe('old message');
    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('reconnects after the socket closes and falls back to HTTP send while reconnecting', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const firstSocket = MockWebSocket.instances[0]!;
    act(() => {
      firstSocket.open();
      firstSocket.shutdown();
    });

    expect(result.current.connectionStatus).toBe('connecting');

    await act(async () => {
      await result.current.send('retry after reconnect');
    });

    expect(mockSendMessage).toHaveBeenCalledWith('chat-1', 'retry after reconnect');

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    const secondSocket = MockWebSocket.instances[1]!;
    expect(secondSocket.sent).toHaveLength(0);
  });
});
