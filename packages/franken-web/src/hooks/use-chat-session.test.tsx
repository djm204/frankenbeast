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

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }
}

function sessionResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'session-1',
      projectId: 'project-1',
      socketToken: 'socket-token',
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

  it('turns socket turn errors into visible retry banners', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sessionResponse())));
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    await act(async () => {
      await result.current.send('launch beast');
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

  it('replaces the failed optimistic message when retrying the last message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sessionResponse())));
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    await act(async () => {
      await result.current.send('launch beast');
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
    await act(async () => {
      result.current.retryError(retryBanner.id);
    });

    expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.send).toHaveBeenCalledTimes(2);
  });

  it('does not offer message retry when delivery succeeded but transcript refresh failed', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(sessionResponse()))
      .mockResolvedValueOnce(jsonResponse({ data: { tier: 'cheap' } }))
      .mockRejectedValueOnce(new Error('refresh failed'));
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

  it('does not offer retry for invalid socket payload errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sessionResponse())));
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    await act(async () => {
      await result.current.send('x'.repeat(20_000));
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
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(sessionResponse()))
      .mockResolvedValueOnce(jsonResponse(sessionResponse({ socketToken: 'fresh-token' })));
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sessionResponse())));
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() => useChatSession({ baseUrl: 'http://chat.test', projectId: 'project-1' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    act(() => {
      MockWebSocket.instances[0]!.onopen?.();
    });
    await act(async () => {
      await result.current.send('hello');
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

  it('reconnects when the browser returns online after an offline close', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sessionResponse())));
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
