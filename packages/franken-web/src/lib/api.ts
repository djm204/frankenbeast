export interface PendingApproval {
  description: string;
  requestedAt: string;
}

export interface TranscriptMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  modelTier?: string;
  tokens?: number;
  costUsd?: number;
}

export interface TokenTotals {
  cheap: number;
  premiumReasoning: number;
  premiumExecution: number;
}

export interface ChatSession {
  id: string;
  projectId: string;
  transcript: TranscriptMessage[];
  state: string;
  pendingApproval?: PendingApproval | null;
  socketToken: string;
  tokenTotals: TokenTotals;
  costUsd: number;
  createdAt: string;
  updatedAt: string;
}

export type TurnOutcome =
  | { kind: 'reply'; content: string; modelTier: string }
  | { kind: 'clarify'; question: string; options: string[] }
  | { kind: 'plan'; planSummary: string; chunkCount: number }
  | { kind: 'execute'; taskDescription: string; approvalRequired: boolean };

export interface MessageResult {
  outcome: TurnOutcome;
  tier: string;
  state: string;
}

export interface ApproveResult {
  id: string;
  approved: boolean;
  state: string;
}

interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

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
  constructor(private readonly baseUrl: string) {}

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
    const res = await fetch(`${this.baseUrl}${path}`, init);

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

    const body = (await res.json()) as { data: T };
    return body.data;
  }
}
