import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatSession } from './use-chat-session';

const tokenTotals = { cheap: 0, premiumReasoning: 0, premiumExecution: 0 };

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();

  constructor(readonly url: string, readonly protocols?: string | string[]) {
    MockWebSocket.instances.push(this);
  }
}

function sessionResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'session-1',
      projectId: 'project-1',
      transcript: [],
      pendingApproval: null,
      tokenTotals,
      costUsd: 0,
      ...overrides,
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function ticketResponse(ticket = 'socket-token') {
  return { data: { ticket } };
}

function chatFetch(options: { tickets?: string[]; responses?: Array<Response | Promise<Response>> } = {}) {
  const tickets = [...(options.tickets ?? ['socket-token'])];
  const responses = [...(options.responses ?? [])];
  return vi.fn((input: RequestInfo | URL) => {
    if (String(input).includes('/socket-ticket')) {
      return Promise.resolve(jsonResponse(ticketResponse(tickets.shift() ?? 'socket-token')));
    }
    const next = responses.shift();
    if (next) {
      return Promise.resolve(next);
    }
    return Promise.resolve(jsonResponse(sessionResponse()));
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('useChatSession error banners', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    MockWebSocket.instances = [];
  });

  it('surfaces session init failures with an actionable retry banner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('HTTP 503')));

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.connectionStatus).toBe('error');
    expect(result.current.errorBanners[0]).toMatchObject({
      title: 'Unable to start chat session',
      message: 'HTTP 503',
      code: 'session_init_failed',
      actionLabel: 'Retry session',
    });
  });

  it('opens websocket connections without putting the socket token in the URL', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:3000/v1/chat/ws?sessionId=session-1');
    expect(MockWebSocket.instances[0]!.url).not.toContain('socket-token');
    expect(MockWebSocket.instances[0]!.protocols).toEqual([
      'franken.chat.v1',
      'franken.chat.token.socket-token',
    ]);
  });

  it('fetches a fresh socket token before reconnecting a closed websocket', async () => {
    const fetch = chatFetch({ tickets: ['socket-token-1', 'socket-token-2'] });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    expect(MockWebSocket.instances[0]!.protocols).toEqual([
      'franken.chat.v1',
      'franken.chat.token.socket-token-1',
    ]);

    act(() => {
      MockWebSocket.instances[0]!.onclose?.();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
    expect(fetch).toHaveBeenNthCalledWith(3,
      'http://localhost:3000/v1/chat/sessions/session-1',
      { credentials: 'same-origin', method: 'GET' },
    );
    expect(MockWebSocket.instances[1]!.protocols).toEqual([
      'franken.chat.v1',
      'franken.chat.token.socket-token-2',
    ]);
  });

  it('fetches a fresh socket token before reconnecting after a websocket error', async () => {
    const fetch = chatFetch({ tickets: ['socket-token-1', 'socket-token-2'] });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    expect(MockWebSocket.instances[0]!.protocols).toEqual([
      'franken.chat.v1',
      'franken.chat.token.socket-token-1',
    ]);

    act(() => {
      MockWebSocket.instances[0]!.onerror?.();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
    expect(fetch).toHaveBeenNthCalledWith(3,
      'http://localhost:3000/v1/chat/sessions/session-1',
      { credentials: 'same-origin', method: 'GET' },
    );
    expect(MockWebSocket.instances[1]!.protocols).toEqual([
      'franken.chat.v1',
      'franken.chat.token.socket-token-2',
    ]);
  });

  it('turns socket turn errors into visible retry banners', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('launch beast').catch(() => undefined);
    });
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'turn.error',
          code: 'TOOL_DENIED',
          message: 'Approval denied by policy.',
          timestamp: '2026-07-05T00:00:00.000Z',
        }),
      });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorBanners[0]).toMatchObject({
      title: 'Turn failed',
      message: 'Approval denied by policy.',
      code: 'TOOL_DENIED',
      actionLabel: 'Retry last message',
    });
  });

  it('preserves approval metadata on activity events for readable timeline chips', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'turn.approval.requested',
          description: 'Run npm test',
          risk: 'medium',
          tool: 'terminal',
          command: 'npm test',
          affectedFiles: ['packages/franken-web/src/components/activity-pane.tsx'],
          sessionId: 'session-1',
          timestamp: '2026-07-05T00:00:00.000Z',
        }),
      });
    });

    expect(result.current.activity[0]).toMatchObject({
      type: 'turn.approval.requested',
      data: {
        description: 'Run npm test',
        risk: 'medium',
        tool: 'terminal',
        command: 'npm test',
        affectedFiles: ['packages/franken-web/src/components/activity-pane.tsx'],
        sessionId: 'session-1',
      },
    });
  });

  it('replaces the failed optimistic message when retrying the last message', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('launch beast').catch(() => undefined);
    });
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'turn.error',
          code: 'TOOL_DENIED',
          message: 'Approval denied by policy.',
          timestamp: '2026-07-05T00:00:00.000Z',
        }),
      });
    });

    const retryBanner = result.current.errorBanners[0]!;
    let retryPromise: Promise<string | undefined>;
    act(() => {
      retryPromise = result.current.retryError(retryBanner.id);
    });
    await waitFor(() => {
      expect(MockWebSocket.instances[0]!.send).toHaveBeenCalledTimes(2);
    });
    const retriedMessageId = result.current.messages.find((message) => message.role === 'user')!.id;
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({ type: 'message.accepted', clientMessageId: retriedMessageId }),
      });
    });
    await act(async () => {
      await retryPromise;
    });

    expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.send).toHaveBeenCalledTimes(2);
  });

  it('does not offer message retry when delivery succeeded but transcript refresh failed', async () => {
    const fetch = chatFetch({
      responses: [
        jsonResponse(sessionResponse()),
        jsonResponse({ data: { tier: 'cheap' } }),
        jsonResponse({ error: { message: 'refresh failed' } }, 500),
      ],
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    MockWebSocket.instances[0]!.readyState = 0;

    await act(async () => {
      await result.current.send('launch beast');
    });

    expect(result.current.errorBanners[0]).toMatchObject({
      title: 'Message sent; refresh failed',
      code: 'session_refresh_failed',
      actionLabel: 'Refresh chat',
    });
  });

  it('waits for fallback HTTP refresh before adding the sent message', async () => {
    const fallbackSend = deferred<Response>();
    const fetch = chatFetch({
      responses: [
        jsonResponse(sessionResponse()),
        fallbackSend.promise,
        jsonResponse(sessionResponse({
          transcript: [
            {
              id: 'server-user-1',
              role: 'user',
              content: 'launch beast',
              timestamp: '2026-07-06T00:00:00.000Z',
            },
          ],
        })),
      ],
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    MockWebSocket.instances[0]!.readyState = 0;

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('launch beast');
    });

    expect(result.current.messages).toEqual([]);

    await act(async () => {
      fallbackSend.resolve(jsonResponse({ data: { tier: 'cheap' } }));
      await sendPromise;
    });

    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'server-user-1', role: 'user', content: 'launch beast' }),
    ]);
  });

  it('keeps failed fallback HTTP messages retryable in the transcript', async () => {
    const fallbackSend = deferred<Response>();
    const fetch = chatFetch({ responses: [jsonResponse(sessionResponse()), fallbackSend.promise] });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    MockWebSocket.instances[0]!.readyState = 0;

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send('launch beast');
    });

    expect(result.current.messages).toEqual([]);

    await act(async () => {
      fallbackSend.reject(new Error('fallback offline'));
      await sendPromise.catch(() => undefined);
    });

    expect(result.current.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'launch beast',
        receipt: 'failed',
        error: 'fallback offline',
        canRetry: true,
      }),
    ]);
    expect(result.current.errorBanners[0]).toMatchObject({
      title: 'Message was not sent',
      actionLabel: 'Retry last message',
    });
  });


  it('does not offer retry for invalid socket payload errors', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('x'.repeat(20_000)).catch(() => undefined);
    });
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'turn.error',
          code: 'INVALID_EVENT',
          message: 'Message content is too long.',
          timestamp: '2026-07-05T00:00:00.000Z',
        }),
      });
    });

    expect(result.current.errorBanners[0]).toMatchObject({
      code: 'INVALID_EVENT',
      actionLabel: 'Dismiss',
    });
  });

  it('resets status after a successful reconnect refresh', async () => {
    const fetch = chatFetch({ tickets: ['socket-token', 'fresh-token'] });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onerror?.();
    });

    const retryBanner = result.current.errorBanners[0]!;
    await act(async () => {
      result.current.retryError(retryBanner.id);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('routes missing-session socket errors to session retry', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('hello').catch(() => undefined);
    });
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'turn.error',
          code: 'NO_SESSION',
          message: 'Chat session is missing.',
          timestamp: '2026-07-05T00:00:00.000Z',
        }),
      });
    });

    expect(result.current.errorBanners[0]).toMatchObject({
      code: 'NO_SESSION',
      actionLabel: 'Retry session',
    });
  });

  it('does not retry messages or refresh sessions that the server reports as not found', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('hello').catch(() => undefined);
    });
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'turn.error',
          code: 'NOT_FOUND',
          message: 'Chat session was not found.',
          timestamp: '2026-07-05T00:00:00.000Z',
        }),
      });
    });

    expect(result.current.errorBanners[0]).toMatchObject({
      code: 'NOT_FOUND',
      actionLabel: 'Dismiss',
    });
  });

  it('keeps locally delivered user messages when a session-ready snapshot is missing them', async () => {
    vi.stubGlobal('fetch', chatFetch());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('preserve delivered prompt').catch(() => undefined);
    });
    const userMessageId = result.current.messages.find((message) => message.role === 'user')!.id;
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({ type: 'message.accepted', clientMessageId: userMessageId }),
      });
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({ type: 'message.delivered', clientMessageId: userMessageId }),
      });
      MockWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'session.ready',
          transcript: [],
          pendingApproval: null,
          projectId: 'project-1',
        }),
      });
    });

    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: userMessageId,
        content: 'preserve delivered prompt',
        receipt: 'failed',
        canRetry: true,
      }),
    ]));
  });

  it('keeps failed local messages when a manual refresh returns a stale snapshot', async () => {
    const fetch = chatFetch({
      tickets: ['socket-token', 'fresh-token'],
      responses: [
        jsonResponse(sessionResponse()),
        jsonResponse(sessionResponse({ transcript: [] })),
      ],
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('failed refresh prompt').catch(() => undefined);
    });
    act(() => {
      MockWebSocket.instances[0]!.onerror?.();
    });

    const reconnectBanner = result.current.errorBanners[0]!;
    await act(async () => {
      await result.current.retryError(reconnectBanner.id);
    });

    await waitFor(() => {
      expect(result.current.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ content: 'failed refresh prompt', receipt: 'failed' }),
      ]));
    });
  });

  it('marks pending sends failed when reconnect cleanup races the server ack', async () => {
    const fetch = chatFetch({ tickets: ['socket-token-1', 'socket-token-2'] });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    act(() => {
      void result.current.send('pending reconnect prompt').catch(() => undefined);
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(result.current.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ content: 'pending reconnect prompt', receipt: 'failed' }),
      ]));
    });
  });

  it('reconnects when the browser returns online after an offline close', async () => {
    const fetch = chatFetch({ tickets: ['socket-token-1', 'socket-token-2'] });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => {
      MockWebSocket.instances[0]!.onclose?.();
    });
    expect(result.current.connectionStatus).toBe('offline');

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });
});
