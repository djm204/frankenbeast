import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatSession } from '../../src/hooks/use-chat-session';
import type { ChatApiClient } from '../../src/lib/api';

// --- Mock API client ---
const mockCreateSession = vi.fn();
const mockGetSession = vi.fn();
const mockSendMessage = vi.fn();
const mockApprove = vi.fn();
const mockStreamUrl = vi.fn();

vi.mock('../../src/lib/api', () => ({
  ChatApiClient: vi.fn().mockImplementation(() => ({
    createSession: mockCreateSession,
    getSession: mockGetSession,
    sendMessage: mockSendMessage,
    approve: mockApprove,
    streamUrl: mockStreamUrl,
  })),
}));

// --- Mock EventSource ---
let eventSourceInstance: {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
};

const MockEventSource = vi.fn().mockImplementation(() => {
  eventSourceInstance = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  };
  return eventSourceInstance;
});

vi.stubGlobal('EventSource', MockEventSource);

describe('useChatSession', () => {
  const opts = { baseUrl: 'http://localhost:3000', projectId: 'test-proj' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue({
      id: 'chat-1',
      projectId: 'test-proj',
      transcript: [],
      state: 'active',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:00Z',
    });
    mockStreamUrl.mockReturnValue('http://localhost:3000/v1/chat/sessions/chat-1/stream');
  });

  it('starts with empty transcript and idle status', () => {
    const { result } = renderHook(() => useChatSession(opts));
    expect(result.current.transcript).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('exposes send function', () => {
    const { result } = renderHook(() => useChatSession(opts));
    expect(typeof result.current.send).toBe('function');
  });

  it('exposes approve function', () => {
    const { result } = renderHook(() => useChatSession(opts));
    expect(typeof result.current.approve).toBe('function');
  });

  it('exposes tier as null initially', () => {
    const { result } = renderHook(() => useChatSession(opts));
    expect(result.current.tier).toBeNull();
  });

  it('creates session on mount and sets sessionId', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(mockCreateSession).toHaveBeenCalledWith('test-proj');
  });

  it('sets up EventSource after session creation', async () => {
    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    expect(MockEventSource).toHaveBeenCalledWith(
      'http://localhost:3000/v1/chat/sessions/chat-1/stream',
    );
  });

  it('closes EventSource on unmount', async () => {
    const { result, unmount } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    unmount();
    expect(eventSourceInstance.close).toHaveBeenCalled();
  });

  it('send() calls API and updates transcript', async () => {
    mockSendMessage.mockResolvedValue({
      outcome: { kind: 'reply', content: 'Hello!', modelTier: 'cheap' },
      tier: 'cheap',
      state: 'active',
    });

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    await act(async () => {
      await result.current.send('hi there');
    });

    expect(mockSendMessage).toHaveBeenCalledWith('chat-1', 'hi there');
    expect(result.current.transcript).toHaveLength(2); // user msg + assistant reply
    expect(result.current.transcript[0]!.role).toBe('user');
    expect(result.current.transcript[0]!.content).toBe('hi there');
    expect(result.current.transcript[1]!.role).toBe('assistant');
    expect(result.current.transcript[1]!.content).toBe('Hello!');
    expect(result.current.tier).toBe('cheap');
  });

  it('approve() calls API approve method', async () => {
    mockApprove.mockResolvedValue({ id: 'chat-1', approved: true, state: 'approved' });

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    await act(async () => {
      await result.current.approve(true);
    });

    expect(mockApprove).toHaveBeenCalledWith('chat-1', true);
  });

  it('sets status to error when session creation fails', async () => {
    mockCreateSession.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
  });

  it('sets status to loading during send', async () => {
    let resolveMsg: (v: unknown) => void;
    mockSendMessage.mockReturnValue(
      new Promise((r) => {
        resolveMsg = r;
      }),
    );

    const { result } = renderHook(() => useChatSession(opts));

    await waitFor(() => {
      expect(result.current.sessionId).toBe('chat-1');
    });

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send('test');
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveMsg!({
        outcome: { kind: 'reply', content: 'ok', modelTier: 'cheap' },
        tier: 'cheap',
        state: 'active',
      });
      await sendPromise!;
    });

    expect(result.current.status).toBe('idle');
  });

  it('resumes session if sessionId provided', async () => {
    mockGetSession.mockResolvedValue({
      id: 'existing-sess',
      projectId: 'test-proj',
      transcript: [{ role: 'user', content: 'old message', timestamp: '2026-03-09T00:00:00Z' }],
      state: 'active',
      tokenTotals: { cheap: 5, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:00Z',
    });

    const { result } = renderHook(() =>
      useChatSession({ ...opts, sessionId: 'existing-sess' }),
    );

    await waitFor(() => {
      expect(result.current.sessionId).toBe('existing-sess');
    });

    expect(mockGetSession).toHaveBeenCalledWith('existing-sess');
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(result.current.transcript).toHaveLength(1);
  });
});
