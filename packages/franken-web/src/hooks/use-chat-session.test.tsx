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

function sessionResponse() {
  return {
    data: {
      id: 'session-1',
      projectId: 'project-1',
      socketToken: 'socket-token',
      transcript: [],
      pendingApproval: null,
      tokenTotals,
      costUsd: 0,
    },
  };
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionResponse()), { status: 200 })));
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
});
