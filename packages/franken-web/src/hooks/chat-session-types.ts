import type { ApprovalDecisionRequest, PendingApproval, TokenTotals } from '@franken/types';

export type SessionStatus = 'idle' | 'connecting' | 'sending' | 'streaming' | 'error';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'offline' | 'error';
export type MessageReceipt = 'sending' | 'accepted' | 'delivered' | 'read' | 'failed';
export type CostTelemetryStatus = 'available' | 'unavailable';
export type TokenTelemetryStatus = 'available' | 'unavailable';
export type ChatErrorAction = 'retry-session' | 'reconnect' | 'retry-message' | 'dismiss';

export interface ChatErrorBanner {
  id: string;
  title: string;
  message: string;
  code?: string;
  action: ChatErrorAction;
  actionLabel: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  modelTier?: string | undefined;
  receipt?: MessageReceipt;
  error?: string | undefined;
  canRetry?: boolean | undefined;
  streaming?: boolean | undefined;
}

export interface ActivityEvent {
  type: string;
  data?: Record<string, unknown> | undefined;
  timestamp: string;
}

export interface UseChatSessionOptions {
  baseUrl: string;
  projectId: string;
  sessionId?: string | undefined;
  sessionSeed?: number;
}

export interface UseChatSessionResult {
  activity: ActivityEvent[];
  approve: (approved: boolean, request?: ApprovalDecisionRequest) => Promise<void>;
  approvalError: string | null;
  approvalResolving: boolean;
  connectionStatus: ConnectionStatus;
  costUsd: number;
  costTelemetryStatus: CostTelemetryStatus;
  tokenTelemetryStatus: TokenTelemetryStatus;
  clearedFailedDraft?: { content: string; nonce: number } | undefined;
  dismissError: (id: string) => void;
  errorBanners: ChatErrorBanner[];
  messages: ChatMessage[];
  pendingApproval: PendingApproval | null;
  projectId: string;
  retryError: (id: string) => Promise<string | undefined>;
  retryMessage: (messageId: string) => Promise<void>;
  reconnect: () => void;
  send: (content: string) => Promise<void>;
  sessionId: string | null;
  sessionState: string | null;
  showTypingIndicator: boolean;
  status: SessionStatus;
  tier: string | null;
  tokenTotals: TokenTotals;
}
