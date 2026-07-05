import { useEffect, useRef, useState } from 'react';
import {
  ChatApiClient,
  type ChatSession,
  type PendingApproval,
  type TokenTotals,
  type TranscriptMessage,
} from '../lib/api';

export type SessionStatus = 'idle' | 'connecting' | 'sending' | 'streaming' | 'error';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type MessageReceipt = 'sending' | 'accepted' | 'delivered' | 'read';

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
  messages: ChatMessage[];
  pendingApproval: PendingApproval | null;
  projectId: string;
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

  const clientRef = useRef(new ChatApiClient(opts.baseUrl));
  // Refresh the client when the baseUrl changes; useRef alone would pin the original.
  useEffect(() => {
    clientRef.current = new ChatApiClient(opts.baseUrl);
  }, [opts.baseUrl]);
  const readyRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const approvalResolvingRef = useRef(false);

  function updateApprovalResolving(value: boolean): void {
    approvalResolvingRef.current = value;
    setApprovalResolving(value);
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
    setStatus('connecting');
    setConnectionStatus('connecting');

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
      } catch {
        if (!cancelled) {
          setStatus('error');
          setConnectionStatus('error');
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [opts.projectId, opts.sessionId, opts.sessionSeed, opts.baseUrl]);

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
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (approvalResolvingRef.current) {
        updateApprovalResolving(false);
        setApprovalError('Connection interrupted while resolving approval. Try again if approval is still pending.');
      }
      setConnectionStatus('disconnected');
      if (shouldReconnect) {
        setSocketGeneration((current) => current + 1);
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
        const refreshed = await clientRef.current.getSession(sessionId);
        setMessages(applySessionSnapshot(refreshed));
        setPendingApproval(refreshed.pendingApproval ?? null);
        setTokenTotals(refreshed.tokenTotals);
        setCostUsd(refreshed.costUsd);
        setTier(result.tier);
        setStatus('idle');
      } catch {
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
      } catch (err) {
        updateApprovalResolving(false);
        setApprovalError(err instanceof Error ? err.message : 'Approval failed. Try again.');
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
    messages,
    pendingApproval,
    projectId,
    send,
    sessionId,
    showTypingIndicator,
    status,
    tier,
    tokenTotals,
  };
}
