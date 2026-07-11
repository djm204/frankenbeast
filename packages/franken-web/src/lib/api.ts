import type {
  ApiDataEnvelope,
  ApiErrorEnvelope,
  ApproveResult,
  ChatSocketTicketResponse,
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

export interface CorruptChatSessionFile {
  id: string;
  projectId?: string;
  path: string;
  quarantinePath: string;
  reason: string;
}

export interface ChatSessionListResponse {
  sessions: ChatSessionSummary[];
  corruptSessions: CorruptChatSessionFile[];
}

export const CHAT_SOCKET_PROTOCOL = 'franken.chat.v1';
export const CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX = 'franken.chat.token.';

export function toSocketUrl(baseUrl: string, sessionId: string, _token?: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/chat/ws`;
  url.search = '';
  url.searchParams.set('sessionId', sessionId);
  return url.toString();
}

export function toSocketProtocols(token: string): string[] {
  return [CHAT_SOCKET_PROTOCOL, `${CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX}${token}`];
}

export function resolveChatRequestBaseUrl(
  baseUrl: string,
  locationOrigin: string | undefined = typeof window !== 'undefined' ? window.location.origin : undefined,
  useSameOriginProxy: boolean = import.meta.env.DEV || import.meta.env.VITE_CHAT_SAME_ORIGIN === 'true',
): string {
  if (!useSameOriginProxy || !locationOrigin) {
    return baseUrl;
  }

  try {
    const configured = new URL(baseUrl, locationOrigin);
    const configuredPath = configured.pathname.replace(/\/$/, '');
    if (configured.origin === locationOrigin) {
      return `${configured.origin}${configuredPath}`;
    }
    return `${locationOrigin}${configuredPath}`;
  } catch {
    return locationOrigin;
  }
}

export function resolveChatRequestCredentials(
  requestBaseUrl: string,
  locationOrigin: string | undefined = typeof window !== 'undefined' ? window.location.origin : undefined,
): RequestCredentials {
  if (!locationOrigin) {
    return 'same-origin';
  }

  try {
    return new URL(requestBaseUrl, locationOrigin).origin === locationOrigin ? 'same-origin' : 'include';
  } catch {
    return 'same-origin';
  }
}

export class ChatApiClient {
  private readonly requestBaseUrl: string;
  private readonly requestCredentials: RequestCredentials;

  constructor(private readonly baseUrl: string) {
    this.requestBaseUrl = resolveChatRequestBaseUrl(baseUrl);
    this.requestCredentials = resolveChatRequestCredentials(this.requestBaseUrl);
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

  async createSocketTicket(sessionId: string): Promise<string> {
    const response = await this.request<ChatSocketTicketResponse>(
      `/v1/chat/sessions/${encodeURIComponent(sessionId)}/socket-ticket`,
      { method: 'POST' },
    );
    return response.ticket;
  }

  async listSessions(projectId?: string): Promise<ChatSessionSummary[]> {
    const body = await this.listSessionsWithDiagnostics(projectId);
    return body.sessions;
  }

  async listSessionsWithDiagnostics(projectId?: string): Promise<ChatSessionListResponse> {
    const url = new URL('/v1/chat/sessions', this.requestBaseUrl);
    if (projectId) {
      url.searchParams.set('projectId', projectId);
    }
    const body = await this.request<ChatSessionListResponse>(
      `${url.pathname}${url.search}`,
      { method: 'GET' },
    );
    return { sessions: body.sessions, corruptSessions: body.corruptSessions ?? [] };
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

  socketUrl(sessionId: string, token?: string): string {
    return toSocketUrl(this.requestBaseUrl, sessionId, token);
  }

  socketProtocols(token: string): string[] {
    return toSocketProtocols(token);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    // Browser chat requests authenticate through the same-origin server/BFF
    // layer (or HttpOnly/SameSite cookies), never by accepting an operator
    // bearer token in bundled client code.
    const effectiveInit: RequestInit = {
      ...init,
      credentials: init.credentials ?? this.requestCredentials,
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
