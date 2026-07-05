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

export function resolveChatRequestBaseUrl(
  baseUrl: string,
  locationOrigin: string | undefined = typeof window !== 'undefined' ? window.location.origin : undefined,
  useSameOriginProxy: boolean = import.meta.env.DEV,
): string {
  if (!useSameOriginProxy || !locationOrigin) {
    return baseUrl;
  }

  try {
    const configured = new URL(baseUrl, locationOrigin);
    return configured.origin === locationOrigin ? configured.origin : locationOrigin;
  } catch {
    return locationOrigin;
  }
}

export class ChatApiClient {
  private readonly requestBaseUrl: string;

  constructor(private readonly baseUrl: string) {
    this.requestBaseUrl = resolveChatRequestBaseUrl(baseUrl);
  }

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
    return toSocketUrl(this.requestBaseUrl, sessionId, token);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    // Browser chat requests authenticate through the same-origin server/BFF
    // layer (or HttpOnly/SameSite cookies), never by accepting an operator
    // bearer token in bundled client code.
    const effectiveInit: RequestInit = {
      ...init,
      credentials: init.credentials ?? 'same-origin',
    };
    const res = await fetch(`${this.requestBaseUrl}${path}`, effectiveInit);

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
