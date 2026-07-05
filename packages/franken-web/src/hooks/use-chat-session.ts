import { useEffect, useRef, useState } from 'react';
import {
  ChatApiClient,
  type ChatSession,
  type PendingApproval,
  type TokenTotals,
  type TranscriptMessage,
} from '../lib/api';

export type SessionStatus = 'idle' | 'connecting' | 'sending' | 'streaming' | 'error';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'offline' | 'error';
export type MessageReceipt = 'sending' | 'accepted' | 'delivered' | 'read';

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
  dismissError: (id: string) => void;
  errorBanners: ChatErrorBanner[];
  messages: ChatMessage[];
  pendingApproval: PendingApproval | null;
  projectId: string;
  retryError: (id: string) => void;
  send: (content: string) => Promise<void>;
  sessionId: string | null;
  showTypingIndicator: boolean;
  status: SessionStatus;
  tier: string | null;
  tokenTotals: TokenTotals;
}

type ServerSocketEvent =
  | {
    type: 'session.ready';
    sessionId: string;
    projectId: string;
    transcript: TranscriptMessage[];
    state: string;
    pendingApproval?: PendingApproval | null;
  }
  | {
    type: 'message.accepted' | 'message.delivered';
    clientMessageId: string;
    timestamp: string;
  }
  | {
    type: 'message.read';
    clientMessageId?: string;
    messageId?: string;
    timestamp: string;
  }
  | { type: 'assistant.typing.start'; timestamp: string }
  | {
    type: 'assistant.message.delta';
    messageId: string;
    chunk: string;
    modelTier?: string;
  }
  | {
    type: 'assistant.message.complete';
    messageId: string;
    content: string;
    modelTier?: string;
    timestamp: string;
  }
  | {
    type: 'turn.execution.start' | 'turn.execution.progress' | 'turn.execution.complete';
    data?: Record<string, unknown>;
    timestamp: string;
  }
  | {
    type: 'turn.approval.requested';
    description: string;
    timestamp: string;
    tool?: string;
    command?: string;
    risk?: string;
    affectedFiles?: string[];
    sessionId?: string;
  }
  | {
    type: 'turn.approval.resolved';
    approved: boolean;
    timestamp: string;
  }
  | {
    type: 'turn.error';
    code: string;
    message: string;
    timestamp: string;
  }
  | { type: 'pong'; timestamp: string };

const EMPTY_TOKEN_TOTALS: TokenTotals = {
  cheap: 0,
  premiumReasoning: 0,
  premiumExecution: 0,
};

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

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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
      : (existingIndex >= 0 ? messages[existingIndex]!.timestamp : new Date().toISOString()),
    ...(event.modelTier ? { modelTier: event.modelTier } : {}),
    streaming: event.type === 'assistant.message.delta',
  };

  if (existingIndex >= 0) {
    return messages.map((message, index) => (index === existingIndex ? nextMessage : message));
  }

  return [...messages, nextMessage];
}

function updateReceipt(
  messages: ChatMessage[],
  messageId: string,
  receipt: MessageReceipt,
): ChatMessage[] {
  return messages.map((message) => (
    message.id === messageId
      ? { ...message, receipt }
      : message
  ));
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

export function useChatSession(opts: UseChatSessionOptions): UseChatSessionResult {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalResolving, setApprovalResolving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [costUsd, setCostUsd] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [projectId, setProjectId] = useState(opts.projectId);
  const [sessionId, setSessionId] = useState<string | null>(opts.sessionId ?? null);
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
  const readyRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
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

  function updateApprovalResolving(value: boolean): void {
    approvalResolvingRef.current = value;
    setApprovalResolving(value);
  }

  function refreshSession() {
    if (!sessionId) {
      setSessionRetrySeed((current) => current + 1);
      return;
    }

    void clientRef.current.getSession(sessionId)
      .then((refreshed) => {
        setSocketToken(refreshed.socketToken);
        setMessages(applySessionSnapshot(refreshed));
        setPendingApproval(refreshed.pendingApproval ?? null);
        setTokenTotals(refreshed.tokenTotals);
        setCostUsd(refreshed.costUsd);
        setConnectionStatus('reconnecting');
        setSocketGeneration((current) => current + 1);
      })
      .catch((error) => {
        setStatus('error');
        addErrorBanner(makeBanner(
          'Unable to refresh chat session',
          errorMessage(error, 'The chat API did not return a refreshed session.'),
          'retry-session',
          'Retry session',
          'session_refresh_failed',
        ));
      });
  }

  function retryError(id: string) {
    const action = errorActionRef.current.get(id);
    dismissError(id);
    if (action === 'retry-session' || action === 'reconnect') {
      refreshSession();
    } else if (action === 'retry-message' && lastMessageRef.current) {
      const { clientMessageId, content } = lastMessageRef.current;
      setMessages((current) => current.filter((message) => message.id !== clientMessageId));
      void send(content);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const client = clientRef.current;

    setActivity([]);
    setApprovalError(null);
    updateApprovalResolving(false);
    setMessages([]);
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

        if (cancelled) {
          return;
        }

        setSocketToken(session.socketToken);
        setSessionId(session.id);
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
    if (!sessionId || !socketToken) {
      return;
    }

    let shouldReconnect = true;
    setConnectionStatus('connecting');
    readyRef.current = false;

    const socket = new WebSocket(clientRef.current.socketUrl(sessionId, socketToken));
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus('connected');
      setErrorBanners((current) => current.filter((item) => item.action !== 'reconnect'));
    };

    socket.onmessage = (event) => {
      let payload: ServerSocketEvent;

      try {
        payload = JSON.parse(event.data as string) as ServerSocketEvent;
      } catch {
        return;
      }

      switch (payload.type) {
        case 'session.ready':
          if (!readyRef.current) {
            readyRef.current = true;
            setMessages(normalizeTranscript(payload.transcript));
            setPendingApproval(payload.pendingApproval ?? null);
            setProjectId(payload.projectId);
          }
          return;
        case 'message.accepted':
          setMessages((current) => updateReceipt(current, payload.clientMessageId, 'accepted'));
          return;
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
              data: { description: payload.description },
              timestamp: payload.timestamp,
            },
          ]);
          setStatus('idle');
          return;
        case 'turn.approval.resolved':
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
          addErrorBanner(makeBanner(
            'Turn failed',
            payload.message,
            lastMessageRef.current ? 'retry-message' : 'dismiss',
            lastMessageRef.current ? 'Retry last message' : 'Dismiss',
            payload.code,
          ));
          setStatus('error');
          return;
        case 'pong':
          return;
      }
    };

    socket.onerror = () => {
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
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (approvalResolvingRef.current) {
        updateApprovalResolving(false);
        setApprovalError('Connection interrupted while resolving approval. Try again if approval is still pending.');
      }
      if (shouldReconnect) {
        setConnectionStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting');
        setSocketGeneration((current) => current + 1);
      } else {
        setConnectionStatus('disconnected');
      }
    };

    return () => {
      shouldReconnect = false;
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId, socketToken, socketGeneration]);

  async function send(content: string): Promise<void> {
    const socket = socketRef.current;
    if (!sessionId) {
      return;
    }

    const clientMessageId = makeId('user');
    lastMessageRef.current = { clientMessageId, content };
    setErrorBanners((current) => current.filter((item) => item.action !== 'retry-message'));
    setMessages((current) => [
      ...current,
      {
        id: clientMessageId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        receipt: 'sending',
      },
    ]);
    setStatus('sending');

    if (!socket || socket.readyState !== 1) {
      try {
        const result = await clientRef.current.sendMessage(sessionId, content);
        setTier(result.tier);
        try {
          const refreshed = await clientRef.current.getSession(sessionId);
          setMessages(applySessionSnapshot(refreshed));
          setPendingApproval(refreshed.pendingApproval ?? null);
          setTokenTotals(refreshed.tokenTotals);
          setCostUsd(refreshed.costUsd);
          setStatus('idle');
        } catch (error) {
          addErrorBanner(makeBanner(
            'Message sent; refresh failed',
            errorMessage(error, 'The message was accepted, but the updated transcript could not be loaded.'),
            'retry-session',
            'Refresh chat',
            'session_refresh_failed',
          ));
          setStatus('error');
        }
      } catch (error) {
        addErrorBanner(makeBanner(
          'Message was not sent',
          errorMessage(error, 'The fallback chat request failed before the turn could start.'),
          'retry-message',
          'Retry last message',
          'message_send_failed',
        ));
        setStatus('error');
      }
      return;
    }

    socket.send(JSON.stringify({
      type: 'message.send',
      clientMessageId,
      content,
    }));
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
        await clientRef.current.approve(sessionId, approved);
        const refreshed = await clientRef.current.getSession(sessionId);
        readyRef.current = true;
        setMessages((current) => mergeSessionSnapshot(current, refreshed));
        setPendingApproval(refreshed.pendingApproval ?? null);
        setActivity((current) => [
          ...current,
          {
            type: 'turn.approval.resolved',
            data: { approved },
            timestamp: new Date().toISOString(),
          },
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
    connectionStatus,
    costUsd,
    dismissError,
    errorBanners,
    messages,
    pendingApproval,
    projectId,
    retryError,
    send,
    sessionId,
    showTypingIndicator,
    status,
    tier,
    tokenTotals,
  };
}
