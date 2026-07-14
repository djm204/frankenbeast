import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useChatSession } from '../../src/hooks/use-chat-session';

const mockCreateSession = vi.fn();
const mockCreateSocketTicket = vi.fn();
const mockGetSession = vi.fn();
const mockSendMessage = vi.fn();
const mockApprove = vi.fn();
const mockSocketUrl = vi.fn();
const mockSocketProtocols = vi.fn();

vi.mock('../../src/lib/api', () => ({
  ChatApiClient: vi.fn(function (this: {
    createSession: typeof mockCreateSession;
    createSocketTicket: typeof mockCreateSocketTicket;
    getSession: typeof mockGetSession;
    sendMessage: typeof mockSendMessage;
    approve: typeof mockApprove;
    socketUrl: typeof mockSocketUrl;
    socketProtocols: typeof mockSocketProtocols;
  }) {
    this.createSession = mockCreateSession;
    this.createSocketTicket = mockCreateSocketTicket;
    this.getSession = mockGetSession;
    this.sendMessage = mockSendMessage;
    this.approve = mockApprove;
    this.socketUrl = mockSocketUrl;
    this.socketProtocols = mockSocketProtocols;
  }),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols?: string | string[];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
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
    this.rawMessage(JSON.stringify(payload));
  }

  rawMessage(data: string) {
    this.onmessage?.(
      new MessageEvent('message', { data }),
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
    mockCreateSession.mockReset();
    mockCreateSocketTicket.mockReset();
    mockGetSession.mockReset();
    mockSendMessage.mockReset();
    mockApprove.mockReset();
    mockSocketUrl.mockReset();
    mockSocketProtocols.mockReset();
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
    mockCreateSocketTicket.mockResolvedValue('signed-token');
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
    mockSocketUrl.mockReturnValue('ws://localhost:3000/v1/chat/ws?sessionId=chat-1');
    mockSocketProtocols.mockReturnValue(['franken.chat.v1', 'franken.chat.token.signed-token']);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    MockWebSocket.instances = [];
  });

  it('creates a session and opens a websocket connection', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(result.current.sessionState).toBe('active');
    expect(mockCreateSession).toHaveBeenCalledWith('test-proj');
    expect(mockSocketUrl).toHaveBeenCalledWith('chat-1', 'signed-token');
    expect(mockSocketProtocols).toHaveBeenCalledWith('signed-token');
    expect(MockWebSocket.instances[0]?.url).toBe(
      'ws://localhost:3000/v1/chat/ws?sessionId=chat-1',
    );
    expect(MockWebSocket.instances[0]?.protocols).toEqual([
      'franken.chat.v1',
      'franken.chat.token.signed-token',
    ]);
  });

  it('marks a new session without usage metadata as unavailable telemetry instead of confirmed zero spend', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(result.current.costUsd).toBe(0);
    expect(result.current.tokenTotals).toEqual({ cheap: 0, premiumReasoning: 0, premiumExecution: 0 });
    expect(result.current.costTelemetryStatus).toBe('unavailable');
    expect(result.current.tokenTelemetryStatus).toBe('unavailable');
  });

  it('distinguishes reported zero-cost telemetry from unavailable telemetry', async () => {
    mockCreateSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [{ role: 'assistant', content: 'Free cached reply', timestamp: '2026-03-09T00:00:01Z', tokens: 0, costUsd: 0 }],
      state: 'active',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:01Z',
    });

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(result.current.costUsd).toBe(0);
    expect(result.current.costTelemetryStatus).toBe('available');
    expect(result.current.tokenTelemetryStatus).toBe('available');
  });

  it('keeps spend unavailable when only token telemetry is reported', async () => {
    mockCreateSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [{ role: 'assistant', content: 'Token-only reply', timestamp: '2026-03-09T00:00:01Z', tokens: 12 }],
      state: 'active',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 12, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:01Z',
    });

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(result.current.tokenTotals.cheap).toBe(12);
    expect(result.current.costUsd).toBe(0);
    expect(result.current.costTelemetryStatus).toBe('unavailable');
    expect(result.current.tokenTelemetryStatus).toBe('available');
  });

  it('marks sessions with non-zero usage as available telemetry', async () => {
    mockCreateSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [{ role: 'assistant', content: 'Metered reply', timestamp: '2026-03-09T00:00:01Z', tokens: 12, costUsd: 0.05 }],
      state: 'active',
      pendingApproval: null,
      socketToken: 'signed-token',
      tokenTotals: { cheap: 12, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0.05,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:01Z',
    });

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(result.current.tokenTotals.cheap).toBe(12);
    expect(result.current.costUsd).toBe(0.05);
    expect(result.current.costTelemetryStatus).toBe('available');
    expect(result.current.tokenTelemetryStatus).toBe('available');
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

  it.each([
    ['invalid JSON', (socket: MockWebSocket) => socket.rawMessage('{not json')],
    ['malformed known event', (socket: MockWebSocket) => socket.message({ type: 'assistant.message.delta', messageId: 'assistant-1' })],
    ['unknown event type', (socket: MockWebSocket) => socket.message({ type: 'session.unknown', timestamp: '2026-03-09T00:00:01Z' })],
  ])('surfaces %s as a recoverable websocket protocol error without mutating chat state', async (_name, sendInvalidEvent) => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
      sendInvalidEvent(socket);
    });

    expect(result.current.connectionStatus).toBe('error');
    expect(result.current.status).toBe('error');
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.activity).toHaveLength(0);
    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.errorBanners[0]).toMatchObject({
      title: 'Chat protocol error',
      action: 'reconnect',
      code: 'invalid_socket_event',
    });
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

  it('rejects malformed accepted events instead of resolving pending websocket sends', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('Wait for malformed ack');
    });
    const clientMessageId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.message({
        type: 'message.accepted',
        timestamp: '2026-03-09T00:00:01Z',
      });
    });

    act(() => {
      socket.message({
        type: 'message.accepted',
        clientMessageId,
        sessionId: 'chat-1',
        timestamp: '2026-03-09T00:00:02Z',
      });
    });

    await expect(sendPromise).rejects.toThrow('invalid event');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: clientMessageId,
      receipt: 'failed',
      canRetry: true,
    }));
    expect(result.current.errorBanners[0]).toMatchObject({
      action: 'reconnect',
      code: 'invalid_socket_event',
    });
  });

  it('refreshes approval metadata when an HTTP fallback send is blocked', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    mockSendMessage.mockRejectedValueOnce(new Error('Approval is pending. Resolve the approval request before sending another message.'));
    mockGetSession.mockResolvedValueOnce({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [],
      state: 'pending_approval',
      pendingApproval: {
        description: 'Deploy the generated fix',
        requestedAt: '2026-03-09T00:00:06Z',
      },
      socketToken: 'signed-token',
      tokenTotals: { cheap: 1, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0.01,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:07Z',
    });

    await act(async () => {
      await expect(result.current.send('blocked over HTTP')).rejects.toThrow('Approval is pending');
    });

    expect(result.current.sessionState).toBe('pending_approval');
    expect(result.current.pendingApproval?.description).toBe('Deploy the generated fix');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      content: 'blocked over HTTP',
      receipt: 'failed',
      canRetry: true,
    }));
  });

  it('keeps the draft but does not retry when HTTP fallback refresh fails', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    mockGetSession.mockRejectedValueOnce(new Error('refresh failed'));

    await act(async () => {
      await expect(result.current.send('Already ran on the server')).rejects.toMatchObject({ retryableSend: false });
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      content: 'Already ran on the server',
      receipt: 'accepted',
    }));
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({ receipt: 'failed' }));
    expect(result.current.errorBanners[0]).toMatchObject({
      title: 'Message sent; refresh failed',
      actionLabel: 'Refresh chat',
    });
  });

  it('removes stale failed drafts when an HTTP composer retry succeeds but refresh fails', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    mockSendMessage.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      await expect(result.current.send('retry over HTTP')).rejects.toThrow('network down');
    });
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      content: 'retry over HTTP',
      receipt: 'failed',
      canRetry: true,
    }));

    mockGetSession.mockRejectedValueOnce(new Error('refresh failed'));
    await act(async () => {
      await expect(result.current.send('retry over HTTP')).rejects.toMatchObject({ retryableSend: false });
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.messages.filter((message) => message.content === 'retry over HTTP')).toHaveLength(1);
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      content: 'retry over HTTP',
      receipt: 'accepted',
    }));
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({
      content: 'retry over HTTP',
      receipt: 'failed',
    }));
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

  it('falls back to HTTP when an open websocket throws during send', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });
    socket.send = vi.fn(() => {
      throw new Error('socket closed during send');
    });

    await act(async () => {
      await result.current.send('fallback after websocket race');
    });

    expect(mockSendMessage).toHaveBeenCalledWith('chat-1', 'fallback after websocket race');
    expect(result.current.status).toBe('idle');
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({
      content: 'fallback after websocket race',
      receipt: 'failed',
    }));
    expect(result.current.errorBanners).toHaveLength(0);
  });

  it('removes stale failed drafts when retrying the same prompt', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let failedSend!: Promise<void>;
    act(() => {
      failedSend = result.current.send('retry without duplicates');
    });
    const failedId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.error();
    });
    await expect(failedSend).rejects.toThrow('WebSocket send failed');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: failedId,
      receipt: 'failed',
    }));

    let retrySend!: Promise<void>;
    act(() => {
      retrySend = result.current.retryMessage(failedId);
    });
    const retryId = (JSON.parse(socket.sent[1] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.message({
        type: 'message.accepted',
        clientMessageId: retryId,
        sessionId: 'chat-1',
        timestamp: '2026-03-09T00:00:02Z',
      });
    });
    await act(async () => {
      await retrySend;
    });

    expect(result.current.messages.filter((message) => message.content === 'retry without duplicates')).toHaveLength(1);
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({ id: failedId }));
  });

  it('preserves local failed sends when reconnect snapshots omit them', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let failedSend!: Promise<void>;
    act(() => {
      failedSend = result.current.send('keep failed draft after reconnect');
    });
    const failedId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.shutdown();
    });
    await expect(failedSend).rejects.toThrow('Connection closed');

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    const reconnect = MockWebSocket.instances[1]!;
    act(() => {
      reconnect.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [],
        state: 'active',
        pendingApproval: null,
      });
    });

    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: failedId,
      content: 'keep failed draft after reconnect',
      receipt: 'failed',
      canRetry: true,
    }));
  });

  it('preserves duplicate local messages by consuming snapshot matches by count', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let firstSend!: Promise<void>;
    act(() => {
      firstSend = result.current.send('repeatable prompt');
    });
    const firstId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;
    act(() => {
      socket.message({ type: 'message.accepted', clientMessageId: firstId, sessionId: 'chat-1', timestamp: '2026-03-09T00:00:01Z' });
    });
    await act(async () => {
      await firstSend;
    });

    let secondSend!: Promise<void>;
    act(() => {
      secondSend = result.current.send('repeatable prompt');
    });
    const secondId = (JSON.parse(socket.sent[1] ?? '{}') as { clientMessageId: string }).clientMessageId;
    act(() => {
      socket.message({ type: 'message.accepted', clientMessageId: secondId, sessionId: 'chat-1', timestamp: '2026-03-09T00:00:02Z' });
    });
    await act(async () => {
      await secondSend;
    });

    act(() => {
      socket.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [{ id: 'server-first', role: 'user', content: 'repeatable prompt', timestamp: '2026-03-09T00:00:03Z' }],
        state: 'active',
        pendingApproval: null,
      });
    });

    expect(result.current.messages.filter((message) => message.content === 'repeatable prompt')).toHaveLength(2);
    expect(result.current.messages).toContainEqual(expect.objectContaining({ id: 'server-first' }));
    expect(result.current.messages).toContainEqual(expect.objectContaining({ id: secondId }));
  });

  it('keeps failed retryable duplicates when snapshots already account for prior matching messages', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let firstSend!: Promise<void>;
    act(() => {
      firstSend = result.current.send('repeatable prompt');
    });
    const firstId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;
    act(() => {
      socket.message({ type: 'message.accepted', clientMessageId: firstId, sessionId: 'chat-1', timestamp: '2026-03-09T00:00:01Z' });
    });
    await act(async () => {
      await firstSend;
    });

    let secondSend!: Promise<void>;
    act(() => {
      secondSend = result.current.send('repeatable prompt');
    });
    const secondId = (JSON.parse(socket.sent[1] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.shutdown();
    });
    await expect(secondSend).rejects.toThrow('Connection closed');

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    const reconnect = MockWebSocket.instances[1]!;
    act(() => {
      reconnect.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [{ id: firstId, role: 'user', content: 'repeatable prompt', timestamp: '2026-03-09T00:00:03Z' }],
        state: 'active',
        pendingApproval: null,
      });
    });

    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: secondId,
      content: 'repeatable prompt',
      receipt: 'failed',
      canRetry: true,
    }));
    expect(result.current.clearedFailedDraft).toBeUndefined();
  });

  it('does not mark acknowledged slash commands failed when snapshots omit them', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let slashSend!: Promise<void>;
    act(() => {
      slashSend = result.current.send('/run deployment');
    });
    const slashId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;
    act(() => {
      socket.message({ type: 'message.accepted', clientMessageId: slashId, sessionId: 'chat-1', timestamp: '2026-03-09T00:00:01Z' });
    });
    await act(async () => {
      await slashSend;
    });

    act(() => {
      socket.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [],
        state: 'active',
        pendingApproval: null,
      });
    });

    expect(result.current.messages).not.toContainEqual(expect.objectContaining({
      id: slashId,
      receipt: 'failed',
    }));
    expect(result.current.clearedFailedDraft).toBeUndefined();
  });

  it('clears timed-out drafts after a late acknowledgement arrives', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    vi.useFakeTimers();
    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('eventually accepted draft');
    });
    const clientMessageId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;
    const rejectedSend = expect(sendPromise).rejects.toThrow('Server did not acknowledge the message. Your draft was kept.');

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await rejectedSend;
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: clientMessageId,
      content: 'eventually accepted draft',
      receipt: 'failed',
      canRetry: true,
    }));

    act(() => {
      socket.message({ type: 'message.accepted', clientMessageId, sessionId: 'chat-1', timestamp: '2026-03-09T00:00:02Z' });
    });

    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: clientMessageId,
      receipt: 'accepted',
    }));
    expect(result.current.clearedFailedDraft).toMatchObject({ content: 'eventually accepted draft' });
  });

  it('drops failed placeholders when reconnect snapshots include the prompt', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let failedSend!: Promise<void>;
    act(() => {
      failedSend = result.current.send('server already handled this');
    });
    const failedId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.shutdown();
    });
    await expect(failedSend).rejects.toThrow('Connection closed');

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    const reconnect = MockWebSocket.instances[1]!;
    act(() => {
      reconnect.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [{ id: 'server-copy', role: 'user', content: 'server already handled this', timestamp: '2026-03-09T00:00:03Z' }],
        state: 'active',
        pendingApproval: null,
      });
    });

    expect(result.current.messages.filter((message) => message.content === 'server already handled this')).toHaveLength(1);
    expect(result.current.messages).toContainEqual(expect.objectContaining({ id: 'server-copy' }));
    expect(result.current.messages).not.toContainEqual(expect.objectContaining({ id: failedId }));
    expect(result.current.clearedFailedDraft).toMatchObject({ content: 'server already handled this' });
  });

  it('marks acknowledged local messages retryable when reconnect snapshots omit them', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('accepted but not persisted');
    });
    const clientMessageId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.message({ type: 'message.accepted', clientMessageId, sessionId: 'chat-1', timestamp: '2026-03-09T00:00:01Z' });
    });
    await act(async () => {
      await sendPromise;
    });

    act(() => {
      socket.message({
        type: 'session.ready',
        sessionId: 'chat-1',
        projectId: 'test-proj',
        transcript: [],
        state: 'active',
        pendingApproval: null,
      });
    });

    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: clientMessageId,
      content: 'accepted but not persisted',
      receipt: 'failed',
      canRetry: true,
    }));
  });

  it('does not expose message retry for non-retryable turn errors', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
    });

    let failedSend!: Promise<void>;
    act(() => {
      failedSend = result.current.send('oversized prompt');
    });
    const clientMessageId = (JSON.parse(socket.sent[0] ?? '{}') as { clientMessageId: string }).clientMessageId;

    act(() => {
      socket.message({
        type: 'turn.error',
        code: 'INVALID_EVENT',
        message: 'Prompt is too large',
        timestamp: '2026-03-09T00:00:06Z',
      });
    });

    await expect(failedSend).rejects.toThrow('Prompt is too large');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      id: clientMessageId,
      receipt: 'failed',
      canRetry: false,
    }));
    expect(result.current.errorBanners[0]).toMatchObject({ action: 'dismiss' });
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
    expect(result.current.sessionState).toBe('pending_approval');

    await act(async () => {
      await result.current.approve(true);
    });

    expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({
      type: 'approval.respond',
      approved: true,
    });

    act(() => {
      socket.message({
        type: 'turn.approval.resolved',
        approved: true,
        timestamp: '2026-03-09T00:00:07Z',
      });
    });

    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.sessionState).toBe('approved');
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
    expect(result.current.sessionState).toBe('active');
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

  it('clears approval resolving state after protocol errors so users can retry', async () => {
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

    act(() => socket.message({ type: 'message.accepted', timestamp: '2026-03-09T00:00:07Z' }));

    await waitFor(() => {
      expect(result.current.approvalResolving).toBe(false);
      expect(result.current.approvalError).toContain('invalid response');
    });

    await act(async () => {
      await result.current.approve(false);
    });

    expect(socket.sent).toHaveLength(1);
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
      socket.readyState = 3;
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
        sessionId: 'chat-1',
        timestamp: '2026-03-09T00:00:01Z',
      });
    });
    await act(async () => {
      await sendPromise;
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
      socket.readyState = 3;
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

    expect(result.current.connectionStatus).toBe('reconnecting');

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
