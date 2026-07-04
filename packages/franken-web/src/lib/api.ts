import type {
  ApiDataEnvelope,
  ApiErrorEnvelope,
  ApproveResult,
  ChatSessionResponse as ChatSession,
  ChatSessionSummary,
  MessageResult,
  PendingApproval,
  TokenTotals,
  TranscriptMessage,
  TurnOutcome,
} from '@franken/types';

export type {
  ApproveResult,
  ChatSessionSummary,
  MessageResult,
  PendingApproval,
  TokenTotals,
  TranscriptMessage,
  TurnOutcome,
} from '@franken/types';
export type { ChatSessionResponse as ChatSession } from '@franken/types';

export function toSocketUrl(baseUrl: string, sessionId: string, token: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/chat/ws`;
  url.search = '';
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('token', token);
  return url.toString();
}

export class ChatApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly operatorToken?: string,
  ) {}

  async createSession(projectId: string): Promise<ChatSession> {
    return this.request<ChatSession>('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
  }

  async getSession(id: string): Promise<ChatSession> {
    return this.request<ChatSession>(`/v1/chat/sessions/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  }

  async listSessions(projectId?: string): Promise<ChatSessionSummary[]> {
    const url = new URL('/v1/chat/sessions', this.baseUrl);
    if (projectId) {
      url.searchParams.set('projectId', projectId);
    }
    const body = await this.request<{ sessions: ChatSessionSummary[] }>(
      `${url.pathname}${url.search}`,
      { method: 'GET' },
    );
    return body.sessions;
  }

  async sendMessage(sessionId: string, content: string): Promise<MessageResult> {
    return this.request<MessageResult>(
      `/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      },
    );
  }

  async approve(sessionId: string, approved: boolean): Promise<ApproveResult> {
    return this.request<ApproveResult>(
      `/v1/chat/sessions/${encodeURIComponent(sessionId)}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      },
    );
  }

  socketUrl(sessionId: string, token: string): string {
    return toSocketUrl(this.baseUrl, sessionId, token);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    // Plumb the operator token through every chat request when one is set,
    // matching the `Authorization: Bearer …` convention BeastApiClient uses.
    // When no token is configured, leave init untouched so callers see the
    // exact request shape they passed.
    let effectiveInit: RequestInit = init;
    if (this.operatorToken) {
      const headers = new Headers(init.headers);
      if (!headers.has('authorization')) {
        headers.set('authorization', `Bearer ${this.operatorToken}`);
      }
      effectiveInit = { ...init, headers };
    }
    const res = await fetch(`${this.baseUrl}${path}`, effectiveInit);

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as ApiErrorEnvelope;
        if (body.error?.message) {
          message = body.error.message;
        }
      } catch {
        // Fall through with HTTP status message
      }
      throw new Error(message);
    }

    const body = (await res.json()) as ApiDataEnvelope<T>;
    return body.data;
  }
}
