import { useEffect, useRef, useState } from 'react';
import {
  type ApproveResult,
  ChatApiClient,
  type ChatSession,
  type PendingApproval,
  type TokenTotals,
  type TranscriptMessage,
} from '../lib/api';
import {
  ServerSocketEventSchema,
  type ServerSocketEvent,
  deterministicUuid,
  isoNow,
  seededRandom,
} from '@franken/types';

export type SessionStatus = 'idle' | 'connecting' | 'sending' | 'streaming' | 'error';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'offline' | 'error';
export type MessageReceipt = 'sending' | 'accepted' | 'delivered' | 'read' | 'failed';

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
  modelTier?: string;
  receipt?: MessageReceipt;
  error?: string;
  canRetry?: boolean;
  streaming?: boolean;
}

export interface ActivityEvent {
  type: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface UseChatSessionOptions {
  baseUrl: string;
  projectId: string;
  sessionId?: string;
  sessionSeed?: number;
}

export interface UseChatSessionResult {
  activity: ActivityEvent[];
  approve: (approved: boolean) => Promise<void>;
  approvalError: string | null;
  approvalResolving: boolean;
  connectionStatus: ConnectionStatus;
  costUsd: number;
  clearedFailedDraft?: { content: string; nonce: number };
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

const EMPTY_TOKEN_TOTALS: TokenTotals = {
  cheap: 0,
  premiumReasoning: 0,
  premiumExecution: 0,
};

const SOCKET_SEND_ACK_TIMEOUT_MS = 15_000;

interface PendingSend {
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (error: Error) => void;
}

class NonRetryableSendError extends Error {
  readonly retryableSend = false;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function makeBanner(
  title: string,
  message: string,
  action: ChatErrorAction,
  actionLabel: string,
  code?: string,
): ChatErrorBanner {
  return {
    id: makeId('chat-error'),
    title,
    message,
    action,
    actionLabel,
    ...(code ? { code } : {}),
  };
}

function hasDeterministicSeed(): boolean {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return Boolean(globalWithProcess.process?.env?.['FRANKENBEAST_SEED']);
}

function makeId(prefix: string): string {
  if (hasDeterministicSeed()) {
    return deterministicUuid('packages/franken-web/src/hooks/use-chat-session.ts');
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${seededRandom.random().toString(36).slice(2, 10)}`;
}

function normalizeTranscript(messages: TranscriptMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id ?? makeId(message.role),
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.modelTier ? { modelTier: message.modelTier } : {}),
  }));
}

function appendOrUpdateAssistantMessage(
  messages: ChatMessage[],
  event: Extract<ServerSocketEvent, { type: 'assistant.message.delta' | 'assistant.message.complete' }>,
): ChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === event.messageId);
  const nextMessage: ChatMessage = {
    id: event.messageId,
    role: 'assistant',
    content: event.type === 'assistant.message.delta'
      ? (existingIndex >= 0 ? `${messages[existingIndex]!.content}${event.chunk}` : event.chunk)
      : event.content,
    timestamp: event.type === 'assistant.message.complete'
      ? event.timestamp
      : (existingIndex >= 0 ? messages[existingIndex]!.timestamp : isoNow()),
    ...(event.modelTier ? { modelTier: event.modelTier } : {}),
    streaming: event.type === 'assistant.message.delta',
  };

  if (existingIndex >= 0) {
    return messages.map((message, index) => (index === existingIndex ? nextMessage : message));
  }

  return [...messages, nextMessage];
}

function activityEventsFromApproveResult(result: ApproveResult, approved: boolean): ActivityEvent[] {
  const timestamp = isoNow();
  return [
    {
      type: 'turn.approval.resolved',
      data: { approved },
      timestamp,
    },
    ...(result.events ?? []).flatMap((event): ActivityEvent[] => {
      if (!event || typeof event !== 'object' || !('type' in event)) {
        return [];
      }
      const turnEvent = event as { type: unknown; data?: Record<string, unknown> };
      if (turnEvent.type !== 'start' && turnEvent.type !== 'progress' && turnEvent.type !== 'complete') {
        return [];
      }
      return [{
        type: `turn.execution.${turnEvent.type}`,
        ...(turnEvent.data !== undefined ? { data: turnEvent.data } : {}),
        timestamp,
      }];
    }),
  ];
}

function updateReceipt(
  messages: ChatMessage[],
  messageId: string,
  receipt: MessageReceipt,
): ChatMessage[] {
  return messages.map((message) => (
    message.id === messageId
      ? { ...message, receipt, ...(receipt !== 'failed' ? { error: undefined } : {}) }
      : message
  ));
}

function markMessageFailed(messages: ChatMessage[], messageId: string, error: string, canRetry = true): ChatMessage[] {
  return messages.map((message) => (
    message.id === messageId
      ? { ...message, receipt: 'failed', error, canRetry }
      : message
  ));
}

function isFailedUserDraftForContent(message: ChatMessage, content: string): boolean {
  return message.role === 'user' && message.receipt === 'failed' && message.content === content;
}

function applySessionSnapshot(session: ChatSession): ChatMessage[] {
  return normalizeTranscript(session.transcript);
}

function mergeSessionSnapshot(current: ChatMessage[], session: ChatSession): ChatMessage[] {
  const snapshot = applySessionSnapshot(session);
  const snapshotById = new Map(snapshot.map((message) => [message.id, message]));
  const snapshotEquivalentMessages = new Map<string, ChatMessage[]>();
  for (const message of snapshot) {
    const key = `${message.role}\u0000${message.content}`;
    snapshotEquivalentMessages.set(key, [...(snapshotEquivalentMessages.get(key) ?? []), message]);
  }
  const seen = new Set<string>();
  const merged = current.flatMap((message) => {
    const snapshotMessage = snapshotById.get(message.id);
    if (snapshotMessage) {
      seen.add(message.id);
      return [snapshotMessage];
    }

    const key = `${message.role}\u0000${message.content}`;
    const equivalentMessages = snapshotEquivalentMessages.get(key) ?? [];
    const equivalentMessage = equivalentMessages.shift();
    if (equivalentMessage) {
      seen.add(equivalentMessage.id);
      return [equivalentMessage];
    }

    return [message];
  });

  return [
    ...merged,
    ...snapshot.filter((message) => !seen.has(message.id)),
  ];
}

function preserveLocalRecoveryMessages(
  current: ChatMessage[],
  transcript: TranscriptMessage[],
): { messages: ChatMessage[]; clearedFailedDrafts: string[] } {
  const snapshot = normalizeTranscript(transcript);
  const snapshotIds = new Set(snapshot.map((message) => message.id));
  const unmatchedSnapshotContentCounts = new Map<string, number>();
  const clearedFailedDrafts: string[] = [];

  for (const message of snapshot) {
    const key = `${message.role}\u0000${message.content}`;
    unmatchedSnapshotContentCounts.set(key, (unmatchedSnapshotContentCounts.get(key) ?? 0) + 1);
  }

  const consumeSnapshotMatch = (message: ChatMessage): boolean => {
    const key = `${message.role}\u0000${message.content}`;
    const snapshotMatchCount = unmatchedSnapshotContentCounts.get(key) ?? 0;
    if (snapshotMatchCount === 0) {
      return false;
    }
    if (snapshotMatchCount === 1) {
      unmatchedSnapshotContentCounts.delete(key);
    } else {
      unmatchedSnapshotContentCounts.set(key, snapshotMatchCount - 1);
    }
    return true;
  };

  const localRecoveryMessages = current.flatMap((message): ChatMessage[] => {
    if (snapshotIds.has(message.id)) {
      consumeSnapshotMatch(message);
      return [];
    }

    if (consumeSnapshotMatch(message)) {
      if (message.role === 'user' && message.receipt === 'failed') {
        clearedFailedDrafts.push(message.content);
      }
      return [];
    }

    if (message.role !== 'user' || !message.receipt || message.canRetry === false) {
      return [];
    }

    if (message.receipt === 'failed') {
      return [message];
    }

    if (message.content.trim().startsWith('/')) {
      return [];
    }

    return [{
      ...message,
      receipt: 'failed',
      error: message.error ?? 'The server acknowledged this message but did not include it in the refreshed transcript. Resend to recover it.',
      canRetry: true,
    }];
  });

  return { messages: [...snapshot, ...localRecoveryMessages], clearedFailedDrafts };
}

export function useChatSession(opts: UseChatSessionOptions): UseChatSessionResult {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalResolving, setApprovalResolving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [costUsd, setCostUsd] = useState(0);
  const [clearedFailedDraft, setClearedFailedDraft] = useState<{ content: string; nonce: number } | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [projectId, setProjectId] = useState(opts.projectId);
  const [sessionId, setSessionId] = useState<string | null>(opts.sessionId ?? null);
  const [sessionState, setSessionState] = useState<string | null>(null);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [socketToken, setSocketToken] = useState<string | null>(null);
  const [socketGeneration, setSocketGeneration] = useState(0);
  const [status, setStatus] = useState<SessionStatus>('connecting');
  const [tier, setTier] = useState<string | null>(null);
  const [tokenTotals, setTokenTotals] = useState<TokenTotals>(EMPTY_TOKEN_TOTALS);
  const [errorBanners, setErrorBanners] = useState<ChatErrorBanner[]>([]);
  const [sessionRetrySeed, setSessionRetrySeed] = useState(0);

  const clientRef = useRef(new ChatApiClient(opts.baseUrl));
  // Refresh the client when the baseUrl changes; useRef alone would pin the
  // original client after a proxy/origin switch.
  useEffect(() => {
    clientRef.current = new ChatApiClient(opts.baseUrl);
  }, [opts.baseUrl]);
  const activeSessionIdRef = useRef<string | null>(sessionId);
  const readyRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingSendsRef = useRef<Map<string, PendingSend>>(new Map());
  const lastMessageRef = useRef<{ clientMessageId: string; content: string } | null>(null);
  const errorActionRef = useRef(new Map<string, ChatErrorAction>());
  const approvalResolvingRef = useRef(false);

  function addErrorBanner(banner: ChatErrorBanner) {
    errorActionRef.current.set(banner.id, banner.action);
    setErrorBanners((current) => [banner, ...current.filter((item) => item.action !== banner.action)].slice(0, 3));
  }

  function dismissError(id: string) {
    errorActionRef.current.delete(id);
    setErrorBanners((current) => current.filter((item) => item.id !== id));
  }

  function sessionStillCurrent(capturedSessionId: string): boolean {
    return activeSessionIdRef.current === capturedSessionId;
  }

  function notifyClearedFailedDrafts(contents: string[]) {
    for (const content of contents) {
      setClearedFailedDraft((current) => ({ content, nonce: (current?.nonce ?? 0) + 1 }));
    }
  }

  function reconcileRecoveryMessages(current: ChatMessage[], transcript: TranscriptMessage[]): ChatMessage[] {
    const recovery = preserveLocalRecoveryMessages(current, transcript);
    notifyClearedFailedDrafts(recovery.clearedFailedDrafts);
    return recovery.messages;
  }

  function failPendingSend(messageId: string, error: Error, canRetry = true) {
    const pending = pendingSendsRef.current.get(messageId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutId);
    pendingSendsRef.current.delete(messageId);
    setMessages((current) => markMessageFailed(current, messageId, error.message, canRetry));
    setStatus('error');
    pending.reject(error);
  }

  function failAllPendingSends(error: Error, canRetry = true) {
    for (const messageId of pendingSendsRef.current.keys()) {
      failPendingSend(messageId, error, canRetry);
    }
  }

  function updateApprovalResolving(value: boolean): void {
    approvalResolvingRef.current = value;
    setApprovalResolving(value);
  }

  function refreshSession() {
    if (!sessionId) {
      setSessionRetrySeed((current) => current + 1);
      return;
    }

    const capturedSessionId = sessionId;
    void clientRef.current.getSession(capturedSessionId)
      .then(async (refreshed) => {
        if (!sessionStillCurrent(capturedSessionId) || refreshed.id !== capturedSessionId) {
          return;
        }
        const ticket = await clientRef.current.createSocketTicket(refreshed.id);
        if (!sessionStillCurrent(refreshed.id)) {
          return;
        }
        setSocketToken(ticket);
        setMessages((current) => reconcileRecoveryMessages(current, refreshed.transcript));
        setPendingApproval(refreshed.pendingApproval ?? null);
        setSessionState(refreshed.state);
        setTokenTotals(refreshed.tokenTotals);
        setCostUsd(refreshed.costUsd);
        setStatus('idle');
        setConnectionStatus('reconnecting');
        setSocketGeneration((current) => current + 1);
      })
      .catch((error) => {
        if (!sessionStillCurrent(capturedSessionId)) {
          return;
        }
        setStatus('error');
        setConnectionStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
        addErrorBanner(makeBanner(
          'Unable to refresh chat session',
          errorMessage(error, 'The chat API did not return a refreshed session.'),
          'retry-session',
          'Retry session',
          'session_refresh_failed',
        ));
      });
  }

  async function retryError(id: string): Promise<string | undefined> {
    const action = errorActionRef.current.get(id);
    dismissError(id);
    if (action === 'retry-session' || action === 'reconnect') {
      refreshSession();
      return undefined;
    }
    if (action === 'retry-message' && lastMessageRef.current) {
      const { clientMessageId, content } = lastMessageRef.current;
      setMessages((current) => current.filter((message) => message.id !== clientMessageId));
      await send(content);
      return content;
    }
    return undefined;
  }

  useEffect(() => {
    let cancelled = false;
    const client = clientRef.current;

    setActivity([]);
    setApprovalError(null);
    updateApprovalResolving(false);
    setMessages([]);
    lastMessageRef.current = null;
    activeSessionIdRef.current = null;
    setSessionId(null);
    setSessionState(null);
    setSocketToken(null);
    setPendingApproval(null);
    setShowTypingIndicator(false);
    setTier(null);
    setTokenTotals(EMPTY_TOKEN_TOTALS);
    setCostUsd(0);
    setErrorBanners([]);
    errorActionRef.current.clear();
    setStatus('connecting');
    setConnectionStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'connecting');

    async function init() {
      try {
        const session = opts.sessionId
          ? await client.getSession(opts.sessionId)
          : await client.createSession(opts.projectId);
        const ticket = await client.createSocketTicket(session.id);

        if (cancelled) {
          return;
        }

        activeSessionIdRef.current = session.id;
        setSocketToken(ticket);
        setSessionId(session.id);
        setSessionState(session.state);
        setProjectId(session.projectId);
        setMessages(applySessionSnapshot(session));
        setPendingApproval(session.pendingApproval ?? null);
        setTokenTotals(session.tokenTotals);
        setCostUsd(session.costUsd);
        setStatus('idle');
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setConnectionStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
          addErrorBanner(makeBanner(
            'Unable to start chat session',
            errorMessage(error, 'The chat API did not return a usable session.'),
            'retry-session',
            'Retry session',
            'session_init_failed',
          ));
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [opts.projectId, opts.sessionId, opts.sessionSeed, opts.baseUrl, sessionRetrySeed]);

  useEffect(() => {
    if (!sessionId || !socketToken || typeof window === 'undefined') {
      return;
    }

    function handleOnline() {
      failAllPendingSends(new Error('Connection is reconnecting before the server acknowledged the message.'));
      setConnectionStatus('reconnecting');
      refreshSession();
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [sessionId, socketToken]);

  useEffect(() => {
    if (!sessionId || !socketToken) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setConnectionStatus('offline');
      return;
    }

    let shouldReconnect = true;
    let reconnectRefreshInFlight = false;
    let protocolErrored = false;
    setConnectionStatus('connecting');
    readyRef.current = false;

    function refreshBeforeReconnect() {
      if (reconnectRefreshInFlight) {
        return;
      }
      reconnectRefreshInFlight = true;
      refreshSession();
    }

    function handleProtocolError(message: string) {
      protocolErrored = true;
      shouldReconnect = false;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      try {
        socket.close();
      } catch {
        // Ignore close failures; the protocol-error banner already tells the user how to recover.
      }
      setStatus('error');
      setConnectionStatus('error');
      failAllPendingSends(new Error(message));
      if (approvalResolvingRef.current) {
        updateApprovalResolving(false);
        setApprovalError('The chat server sent an invalid response while resolving approval. Try again if approval is still pending.');
      }
      addErrorBanner(makeBanner(
        'Chat protocol error',
        message,
        'reconnect',
        'Reconnect chat',
        'invalid_socket_event',
      ));
    }

    const socket = new WebSocket(
      clientRef.current.socketUrl(sessionId, socketToken),
      clientRef.current.socketProtocols(socketToken),
    );
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus('connected');
      setErrorBanners((current) => current.filter((item) => item.action !== 'reconnect'));
    };

    socket.onmessage = (event) => {
      if (protocolErrored) {
        return;
      }

      let decoded: unknown;

      try {
        decoded = JSON.parse(event.data as string);
      } catch {
        handleProtocolError('The chat server sent invalid JSON over the WebSocket. Reconnect to refresh the session state.');
        return;
      }

      const parsed = ServerSocketEventSchema.safeParse(decoded);
      if (!parsed.success) {
        const detail = parsed.error.issues[0]?.message ?? 'The event did not match the expected schema.';
        handleProtocolError(`The chat server sent an invalid event: ${detail}`);
        return;
      }

      const payload = parsed.data;

      switch (payload.type) {
        case 'session.ready':
          if (!readyRef.current) {
            readyRef.current = true;
            setMessages((current) => reconcileRecoveryMessages(current, payload.transcript));
            setPendingApproval(payload.pendingApproval ?? null);
            setSessionState(payload.state);
            setProjectId(payload.projectId);
          }
          return;
        case 'message.accepted': {
          const pending = pendingSendsRef.current.get(payload.clientMessageId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pendingSendsRef.current.delete(payload.clientMessageId);
            pending.resolve();
          }
          setMessages((current) => {
            const timedOutDraft = current.find(
              (message) => message.id === payload.clientMessageId
                && message.role === 'user'
                && message.receipt === 'failed',
            );
            if (timedOutDraft) {
              setClearedFailedDraft((cleared) => ({
                content: timedOutDraft.content,
                nonce: (cleared?.nonce ?? 0) + 1,
              }));
            }
            return updateReceipt(current, payload.clientMessageId, 'accepted');
          });
          return;
        }
        case 'message.delivered':
          setMessages((current) => updateReceipt(current, payload.clientMessageId, 'delivered'));
          return;
        case 'message.read':
          if (payload.clientMessageId) {
            const clientMessageId = payload.clientMessageId;
            setMessages((current) => updateReceipt(current, clientMessageId, 'read'));
          }
          return;
        case 'assistant.typing.start':
          setShowTypingIndicator(true);
          setStatus('streaming');
          return;
        case 'assistant.message.delta':
          setShowTypingIndicator(false);
          setStatus('streaming');
          if (payload.modelTier) {
            setTier(payload.modelTier);
          }
          setMessages((current) => appendOrUpdateAssistantMessage(current, payload));
          return;
        case 'assistant.message.complete':
          setShowTypingIndicator(false);
          setStatus('idle');
          if (payload.modelTier) {
            setTier(payload.modelTier);
          }
          setMessages((current) => appendOrUpdateAssistantMessage(current, payload));
          return;
        case 'turn.execution.start':
        case 'turn.execution.progress':
        case 'turn.execution.complete':
          setActivity((current) => [...current, payload]);
          return;
        case 'turn.approval.requested':
          setSessionState('pending_approval');
          setPendingApproval({
            description: payload.description,
            requestedAt: payload.timestamp,
            ...(payload.tool ? { tool: payload.tool } : {}),
            ...(payload.command ? { command: payload.command } : {}),
            ...(payload.risk ? { risk: payload.risk } : {}),
            ...(payload.affectedFiles ? { affectedFiles: payload.affectedFiles } : {}),
            ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
          });
          setApprovalError(null);
          updateApprovalResolving(false);
          setActivity((current) => [
            ...current,
            {
              type: payload.type,
              data: {
                description: payload.description,
                ...(payload.tool ? { tool: payload.tool } : {}),
                ...(payload.command ? { command: payload.command } : {}),
                ...(payload.risk ? { risk: payload.risk } : {}),
                ...(payload.affectedFiles ? { affectedFiles: payload.affectedFiles } : {}),
                ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
              },
              timestamp: payload.timestamp,
            },
          ]);
          setStatus('idle');
          return;
        case 'turn.approval.resolved':
          setSessionState(payload.approved ? 'approved' : 'rejected');
          setPendingApproval(null);
          setApprovalError(null);
          updateApprovalResolving(false);
          setActivity((current) => [
            ...current,
            {
              type: payload.type,
              data: { approved: payload.approved },
              timestamp: payload.timestamp,
            },
          ]);
          return;
        case 'turn.error':
          if (payload.code === 'APPROVAL_PENDING') {
            void refreshSession();
          }
          updateApprovalResolving(false);
          setApprovalError(payload.message);
          setActivity((current) => [
            ...current,
            {
              type: payload.type,
              data: { code: payload.code, message: payload.message },
              timestamp: payload.timestamp,
            },
          ]);
          const missingSessionCanRefresh = payload.code === 'NO_SESSION';
          const canRetryMessage = Boolean(lastMessageRef.current)
            && payload.code !== 'INVALID_EVENT'
            && payload.code !== 'NO_SESSION'
            && payload.code !== 'NOT_FOUND';
          failAllPendingSends(new Error(payload.message), canRetryMessage);
          const action = missingSessionCanRefresh
            ? 'retry-session'
            : canRetryMessage ? 'retry-message' : 'dismiss';
          addErrorBanner(makeBanner(
            'Turn failed',
            payload.message,
            action,
            action === 'retry-session' ? 'Retry session' : canRetryMessage ? 'Retry last message' : 'Dismiss',
            payload.code,
          ));
          setStatus('error');
          return;
        case 'pong':
          return;
      }
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) {
        return;
      }
      const hadPendingSends = pendingSendsRef.current.size > 0;
      failAllPendingSends(new Error('WebSocket send failed before the server acknowledged the message.'));
      if (approvalResolvingRef.current) {
        updateApprovalResolving(false);
        setApprovalError('Connection interrupted while resolving approval. Try again if approval is still pending.');
      }
      setConnectionStatus('error');
      setStatus('error');
      addErrorBanner(makeBanner(
        'Chat connection error',
        'The live chat socket failed. Messages may fall back to HTTP while the app reconnects.',
        'reconnect',
        'Reconnect',
        'socket_error',
      ));
      if (!shouldReconnect || hadPendingSends) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setConnectionStatus('offline');
        return;
      }
      setConnectionStatus('reconnecting');
      refreshBeforeReconnect();
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) {
        return;
      }
      socketRef.current = null;
      failAllPendingSends(new Error('Connection closed before the server acknowledged the message.'));
      if (approvalResolvingRef.current) {
        updateApprovalResolving(false);
        setApprovalError('Connection interrupted while resolving approval. Try again if approval is still pending.');
      }
      if (shouldReconnect) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setConnectionStatus('offline');
          return;
        }
        setConnectionStatus('reconnecting');
        refreshBeforeReconnect();
      } else {
        setConnectionStatus('disconnected');
      }
    };

    return () => {
      shouldReconnect = false;
      failAllPendingSends(new Error('Chat session changed before the server acknowledged the message. Your draft was kept.'));
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId, socketToken, socketGeneration]);

  async function send(content: string): Promise<void> {
    const socket = socketRef.current;
    if (!sessionId) {
      throw new Error('Chat session is not ready yet. Your draft was kept.');
    }

    const clientMessageId = makeId('user');
    const optimisticMessage: ChatMessage = {
      id: clientMessageId,
      role: 'user',
      content,
      timestamp: isoNow(),
      receipt: 'sending',
    };
    const optimisticAdd = Boolean(socket && socket.readyState === 1);
    lastMessageRef.current = { clientMessageId, content };
    setErrorBanners((current) => current.filter((item) => item.action !== 'retry-message'));
    if (optimisticAdd) {
      setMessages((current) => [
        ...current.filter((message) => !isFailedUserDraftForContent(message, content)),
        optimisticMessage,
      ]);
    }
    setStatus('sending');

    if (!optimisticAdd) {
      let fallbackRefreshError: Error | null = null;
      try {
        const result = await clientRef.current.sendMessage(sessionId, content);
        if (!sessionStillCurrent(sessionId)) {
          return;
        }
        setTier(result.tier);
        try {
          const refreshed = await clientRef.current.getSession(sessionId);
          if (!sessionStillCurrent(sessionId)) {
            return;
          }
          readyRef.current = true;
          setMessages((current) => mergeSessionSnapshot(
            current.filter((message) => message.id !== clientMessageId && !isFailedUserDraftForContent(message, content)),
            refreshed,
          ));
          setPendingApproval(refreshed.pendingApproval ?? null);
          setSessionState(refreshed.state);
          setTokenTotals(refreshed.tokenTotals);
          setCostUsd(refreshed.costUsd);
          setStatus('idle');
        } catch (error) {
          if (!sessionStillCurrent(sessionId)) {
            return;
          }
          const refreshMessage = errorMessage(
            error,
            'The fallback chat request completed, but the updated transcript could not be loaded.',
          );
          setMessages((current) => [
            ...current.filter((message) => message.id !== clientMessageId && !isFailedUserDraftForContent(message, content)),
            { ...optimisticMessage, receipt: 'accepted' },
          ]);
          addErrorBanner(makeBanner(
            'Message sent; refresh failed',
            refreshMessage,
            'retry-session',
            'Refresh chat',
            'session_refresh_failed',
          ));
          setStatus('idle');
          fallbackRefreshError = new NonRetryableSendError(refreshMessage);
        }
      } catch (error) {
        if (!sessionStillCurrent(sessionId)) {
          return;
        }
        try {
          const refreshed = await clientRef.current.getSession(sessionId);
          if (sessionStillCurrent(sessionId)) {
            readyRef.current = true;
            setMessages((current) => mergeSessionSnapshot(current, refreshed));
            setPendingApproval(refreshed.pendingApproval ?? null);
            setSessionState(refreshed.state);
            setTokenTotals(refreshed.tokenTotals);
            setCostUsd(refreshed.costUsd);
          }
        } catch {
          // Preserve the original send failure while keeping the draft retryable.
        }
        const sendError = error instanceof Error
          ? error
          : new Error('The fallback chat request failed before the turn could start.');
        setMessages((current) => [
          ...current.filter((message) => !isFailedUserDraftForContent(message, content)),
          { ...optimisticMessage, receipt: 'failed', error: sendError.message, canRetry: true },
        ]);
        addErrorBanner(makeBanner(
          'Message was not sent',
          sendError.message,
          'retry-message',
          'Retry last message',
          'message_send_failed',
        ));
        setStatus('error');
        throw sendError;
      }
      if (fallbackRefreshError) {
        throw fallbackRefreshError;
      }
      return;
    }

    const liveSocket = socket as WebSocket;
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        failPendingSend(clientMessageId, new Error('Server did not acknowledge the message. Your draft was kept.'));
      }, SOCKET_SEND_ACK_TIMEOUT_MS);
      pendingSendsRef.current.set(clientMessageId, { timeoutId, resolve, reject });
      try {
        liveSocket.send(JSON.stringify({
          type: 'message.send',
          clientMessageId,
          content,
        }));
      } catch (error) {
        failPendingSend(
          clientMessageId,
          error instanceof Error ? error : new Error('Message failed to send. Your draft was kept.'),
        );
      }
    });
  }

  async function retryMessage(messageId: string): Promise<void> {
    if (status !== 'idle' && status !== 'error') {
      return;
    }
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!message || message.role !== 'user') {
      return;
    }
    setMessages((current) => current.filter((candidate) => candidate.id !== messageId));
    await send(message.content);
  }

  async function approve(approved: boolean): Promise<void> {
    const socket = socketRef.current;
    if (!sessionId || approvalResolvingRef.current) {
      return;
    }

    setApprovalError(null);
    updateApprovalResolving(true);
    setStatus('sending');
    if (!socket || socket.readyState !== 1) {
      try {
        const approvalResult = await clientRef.current.approve(sessionId, approved);
        const refreshed = await clientRef.current.getSession(sessionId);
        readyRef.current = true;
        setMessages((current) => {
          const withSnapshot = mergeSessionSnapshot(current, refreshed);
          const approvedDisplays = (approvalResult.displayMessages ?? []).flatMap((display): Array<{ content: string }> => {
            if (!display || typeof display !== 'object' || !('content' in display)) {
              return [];
            }
            const content = (display as { content: unknown }).content;
            return typeof content === 'string' ? [{ content }] : [];
          });
          return approvedDisplays.reduce((messages, display) => appendOrUpdateAssistantMessage(messages, {
            type: 'assistant.message.complete',
            messageId: makeId('assistant'),
            content: display.content,
            timestamp: isoNow(),
          }), withSnapshot);
        });
        setPendingApproval(refreshed.pendingApproval ?? null);
        setSessionState(refreshed.state);
        setActivity((current) => [
          ...current,
          ...activityEventsFromApproveResult(approvalResult, approved),
        ]);
        setTokenTotals(refreshed.tokenTotals);
        setCostUsd(refreshed.costUsd);
        updateApprovalResolving(false);
        setApprovalError(null);
        setStatus('idle');
      } catch (error) {
        updateApprovalResolving(false);
        setApprovalError(error instanceof Error ? error.message : 'Approval failed. Try again.');
        addErrorBanner(makeBanner(
          'Approval response failed',
          errorMessage(error, 'The approval response could not be delivered.'),
          'dismiss',
          'Dismiss',
          'approval_failed',
        ));
        setStatus('error');
      }
      return;
    }

    socket.send(JSON.stringify({
      type: 'approval.respond',
      approved,
    }));
  }

  return {
    activity,
    approve,
    approvalError,
    approvalResolving,
    clearedFailedDraft,
    connectionStatus,
    costUsd,
    dismissError,
    errorBanners,
    messages,
    pendingApproval,
    projectId,
    reconnect: refreshSession,
    retryError,
    retryMessage,
    send,
    sessionId,
    sessionState,
    showTypingIndicator,
    status,
    tier,
    tokenTotals,
  };
}
