import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatApiClient, resolveChatRequestBaseUrl } from '../../src/lib/api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ChatApiClient', () => {
  const client = new ChatApiClient('http://localhost:3000');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('server-side chat authentication', () => {
    it('does not accept or attach browser bearer tokens', async () => {
      const LegacyCtor = ChatApiClient as unknown as { new (baseUrl: string, token: string): ChatApiClient };
      const tokened = new LegacyCtor('http://localhost:3000', 'op-secret');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'x', projectId: 'p', transcript: [], state: 'active', socketToken: 't', tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 }, costUsd: 0, createdAt: '2026-03-09T00:00:00Z', updatedAt: '2026-03-09T00:00:00Z' } }),
      });
      await tokened.createSession('p');
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers).toEqual({ 'Content-Type': 'application/json' });
      expect(init.credentials).toBe('same-origin');
    });

    it('uses same-origin credentials so server-side sessions can authenticate requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'x', projectId: 'p', transcript: [], state: 'active', socketToken: 't', tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 }, costUsd: 0, createdAt: '2026-03-09T00:00:00Z', updatedAt: '2026-03-09T00:00:00Z' } }),
      });
      await client.createSession('p');
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers).toEqual({ 'Content-Type': 'application/json' });
      expect(init.credentials).toBe('same-origin');
    });

    it('forces explicit cross-origin chat API URLs through the same-origin BFF', async () => {
      const crossOrigin = new ChatApiClient('https://chat-api.example.test');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'x', projectId: 'p', transcript: [], state: 'active', socketToken: 't', tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 }, costUsd: 0, createdAt: '2026-03-09T00:00:00Z', updatedAt: '2026-03-09T00:00:00Z' } }),
      });

      await crossOrigin.createSession('p');

      expect(mockFetch.mock.calls[0]![0]).toBe(`${window.location.origin}/v1/chat/sessions`);
    });
  });

  describe('resolveChatRequestBaseUrl', () => {
    it('preserves same-origin explicit base URLs', () => {
      expect(resolveChatRequestBaseUrl('http://dashboard.local/api-root', 'http://dashboard.local')).toBe(
        'http://dashboard.local',
      );
    });

    it('rewrites cross-origin explicit base URLs to the dashboard origin', () => {
      expect(resolveChatRequestBaseUrl('https://chat-api.example.test', 'http://dashboard.local')).toBe(
        'http://dashboard.local',
      );
    });
  });

  describe('createSession', () => {
    it('sends POST to /v1/chat/sessions and returns session data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: 'chat-123-abc',
              projectId: 'proj-1',
              transcript: [],
              state: 'active',
              socketToken: 'socket-token-1',
              tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
              costUsd: 0,
              createdAt: '2026-03-09T00:00:00Z',
              updatedAt: '2026-03-09T00:00:00Z',
            },
          }),
      });

      const session = await client.createSession('proj-1');
      expect(session.id).toBe('chat-123-abc');
      expect(session.projectId).toBe('proj-1');
      expect(session.socketToken).toBe('socket-token-1');
      expect(session.transcript).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/v1/chat/sessions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: 'proj-1' }),
        }),
      );
    });
  });

  describe('getSession', () => {
    it('sends GET to /v1/chat/sessions/:id and returns session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: 'chat-123-abc',
              projectId: 'proj-1',
              transcript: [{ role: 'user', content: 'hello', timestamp: '2026-03-09T00:00:00Z' }],
              state: 'active',
              socketToken: 'socket-token-2',
              tokenTotals: { cheap: 10, premiumReasoning: 0, premiumExecution: 0 },
              costUsd: 0.001,
              createdAt: '2026-03-09T00:00:00Z',
              updatedAt: '2026-03-09T00:00:01Z',
            },
          }),
      });

      const session = await client.getSession('chat-123-abc');
      expect(session.id).toBe('chat-123-abc');
      expect(session.socketToken).toBe('socket-token-2');
      expect(session.transcript).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/v1/chat/sessions/chat-123-abc',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('listSessions', () => {
    it('loads session summaries with optional project filtering', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              sessions: [
                {
                  id: 'chat-123-abc',
                  projectId: 'proj-1',
                  state: 'active',
                  messageCount: 2,
                  preview: 'latest turn',
                  createdAt: '2026-03-09T00:00:00Z',
                  updatedAt: '2026-03-09T00:00:05Z',
                },
              ],
            },
          }),
      });

      const sessions = await client.listSessions('proj-1');
      expect(sessions[0]?.id).toBe('chat-123-abc');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/v1/chat/sessions?projectId=proj-1',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('sendMessage', () => {
    it('sends POST to /v1/chat/sessions/:id/messages with content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              outcome: { kind: 'reply', content: 'Hello!', modelTier: 'cheap' },
              tier: 'cheap',
              state: 'active',
            },
          }),
      });

      const result = await client.sendMessage('sess-1', 'hello');
      expect(result.outcome.kind).toBe('reply');
      expect(result.tier).toBe('cheap');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/v1/chat/sessions/sess-1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'hello' }),
        }),
      );
    });
  });

  describe('approve', () => {
    it('sends POST to /v1/chat/sessions/:id/approve with approved flag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: 'sess-1', approved: true, state: 'approved' },
          }),
      });

      const result = await client.approve('sess-1', true);
      expect(result.approved).toBe(true);
      expect(result.state).toBe('approved');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/v1/chat/sessions/sess-1/approve',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: true }),
        }),
      );
    });
  });

  describe('socketUrl', () => {
    it('returns the websocket URL for a session', () => {
      const url = client.socketUrl('sess-1', 'signed-token');
      expect(url).toBe('ws://localhost:3000/v1/chat/ws?sessionId=sess-1&token=signed-token');
    });

    it('keeps cross-origin websocket connections on the same-origin proxy', () => {
      const crossOrigin = new ChatApiClient('https://chat-api.example.test');
      const url = crossOrigin.socketUrl('sess-1', 'signed-token');
      expect(url).toBe('ws://localhost:3000/v1/chat/ws?sessionId=sess-1&token=signed-token');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response with error message from envelope', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            error: { code: 'VALIDATION_ERROR', message: 'Missing field' },
          }),
      });

      await expect(client.createSession('')).rejects.toThrow('Missing field');
    });

    it('throws on non-ok response with status when no error envelope', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('bad json')),
      });

      await expect(client.createSession('proj')).rejects.toThrow('HTTP 500');
    });

    it('throws on 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: { code: 'NOT_FOUND', message: 'Session not found' },
          }),
      });

      await expect(client.getSession('nonexistent')).rejects.toThrow('Session not found');
    });
  });
});
