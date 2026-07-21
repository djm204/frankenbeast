import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { approvalRuntimeInput, UnsafeApprovalCommandError } from '../chat/approval-input.js';
import {
  FileApprovalAuditLog,
  commandSha256,
  type ApprovalAuditLog,
} from '../chat/approval-audit-log.js';
import { ChatRuntime, pendingApprovalRuntimeState } from '../chat/runtime.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { ChatSession } from '../chat/types.js';
import type { TurnEvent } from '../chat/turn-runner.js';
import {
  ChatSocketSessionTicketStore,
  verifyChatSocketRequest,
} from './ws-chat-auth.js';
import { ClientSocketEventSchema, type ChatSessionResponse, type TokenUsage, deterministicUuid, isoNow } from '@franken/types';
import { InMemoryRateLimiter } from '../beasts/http/beast-rate-limit.js';
import { ChatMutationAdmission, chatClientKey, createChatRateLimiter, DEFAULT_CHAT_RATE_LIMIT, type ChatRateLimitOptions } from './chat-rate-limit.js';

export interface ChatSocketPeer {
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface ConnectionState {
  sessionId: string;
  remoteAddress?: string | undefined;
  rateLimitKey: string;
  /** Client opted in (via ?features=message-kind) to `kind` on completions. */
  supportsMessageKind: boolean;
  /** Client opted in (via ?features=usage-stats) to `usage`/`truncated` on completions. */
  supportsUsageStats: boolean;
}

type ClientSocketEvent =
  | { type: 'message.send'; clientMessageId: string; content: string; executionMode?: 'process' | 'container' | undefined }
  | { type: 'approval.respond'; approved: boolean }
  | { type: 'message.read'; messageId: string }
  | { type: 'ping' };

type ServerSocketEvent = {
  eventId?: string | undefined;
  type: string;
  [key: string]: unknown;
};

export interface ChatSocketMessageRateLimitOptions {
  max: number;
  windowMs: number;
}

export interface ChatSocketControllerOptions {
  allowedOrigins?: string[];
  chatMessageRateLimit?: ChatSocketMessageRateLimitOptions;
  runtime: ChatRuntime;
  sessionStore: ISessionStore;
  ticketStore?: ChatSocketSessionTicketStore;
  tokenSecret: string;
  operatorToken?: string | undefined;
  chatRateLimit?: ChatRateLimitOptions;
  chatRateLimiter?: InMemoryRateLimiter;
  chatMutationAdmission?: ChatMutationAdmission;
  maxMessageBytes?: number;
  approvalAuditLog?: ApprovalAuditLog;
}

export interface ChatSocketConnectRequest {
  origin: string | null;
  sessionId: string;
  token: string | null;
  remoteAddress?: string | undefined;
  /**
   * Optional client feature opt-ins from the socket URL. The v1 event schemas
   * are strict, so extensions like `kind` on assistant.message.complete are
   * only sent to clients that explicitly advertise support.
   */
  features?: readonly string[] | undefined;
}

export interface AttachChatWebSocketServerOptions extends ChatSocketControllerOptions {
  path?: string;
  server: HttpServer;
}

export const CHAT_SOCKET_PROTOCOL = 'franken.chat.v1';
export const CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX = 'franken.chat.token.';
export const DEFAULT_CHAT_SOCKET_MAX_MESSAGE_BYTES = 64 * 1024;

interface ChatSocketProtocolAuth {
  hasChatProtocol: boolean;
  token: string | null;
}

interface CounterState {
  count: number;
  resetAt: number;
}

const DEFAULT_CHAT_MESSAGE_RATE_LIMIT: ChatSocketMessageRateLimitOptions = {
  max: 20,
  windowMs: 10_000,
};

function redactPendingApproval(
  pendingApproval: ChatSession['pendingApproval'],
): ChatSessionResponse['pendingApproval'] {
  if (!pendingApproval) return pendingApproval ?? null;
  const redacted = { ...pendingApproval };
  delete redacted.approvalToken;
  delete redacted.requester;
  delete redacted.workerId;
  delete redacted.workdir;
  return redacted;
}

class ChatSocketMessageRateLimiter {
  private readonly counters = new Map<string, CounterState>();

  constructor(private readonly options: ChatSocketMessageRateLimitOptions) {}

  take(key: string): { allowed: boolean; remaining: number } {
    if (this.options.max <= 0) {
      return { allowed: false, remaining: 0 };
    }
    const now = Date.now();
    this.pruneExpired(now);
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      this.counters.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return { allowed: true, remaining: this.options.max - 1 };
    }

    if (current.count >= this.options.max) {
      return { allowed: false, remaining: 0 };
    }

    current.count += 1;
    return { allowed: true, remaining: this.options.max - current.count };
  }

  private pruneExpired(now: number): void {
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }
}

function nowIso(): string {
  return isoNow();
}

function splitIntoChunks(content: string, maxLength = 48): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += maxLength) {
    chunks.push(content.slice(index, index + maxLength));
  }
  return chunks.length > 0 ? chunks : [''];
}

function mapTurnEvent(event: TurnEvent): ServerSocketEvent {
  const timestamp = nowIso();
  switch (event.type) {
    case 'start':
      return { type: 'turn.execution.start', data: event.data as Record<string, unknown> | undefined, timestamp };
    case 'complete':
      if (isPendingApprovalComplete(event.data)) {
        return { type: 'turn.execution.progress', data: event.data, timestamp };
      }
      return { type: 'turn.execution.complete', data: event.data as Record<string, unknown> | undefined, timestamp };
    default:
      return { type: 'turn.execution.progress', data: event.data as Record<string, unknown> | undefined, timestamp };
  }
}

function isPendingApprovalComplete(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object'
    && data !== null
    && 'status' in data
    && data.status === 'pending_approval';
}

function messageIdFromSession(session: ChatSession): string {
  const lastAssistant = [...session.transcript].reverse().find((message) => message.role === 'assistant');
  return lastAssistant?.id ?? deterministicUuid('packages/franken-orchestrator/src/http/ws-chat-server.ts');
}

function createPeerState(
  peer: ChatSocketPeer,
  sessionId: string,
  remoteAddress: string | undefined,
  rateLimitKey: string,
  supportsMessageKind: boolean,
  supportsUsageStats: boolean,
  controller: ChatSocketController,
): ConnectionState {
  const state = { sessionId, remoteAddress, rateLimitKey, supportsMessageKind, supportsUsageStats };
  controller.connections.set(peer, state);
  return state;
}

export class ChatSocketController {
  readonly connections = new Map<ChatSocketPeer, ConnectionState>();
  private readonly eventEpoch = randomUUID();
  private readonly eventSequences = new Map<string, number>();
  private readonly activeSessionTurns = new Set<string>();
  private readonly allowedOrigins: string[];
  private readonly messageRateLimiter: ChatSocketMessageRateLimiter;
  private readonly runtime: ChatRuntime;
  private readonly sessionStore: ISessionStore;
  private readonly ticketStore: ChatSocketSessionTicketStore;
  private readonly tokenSecret: string;
  private readonly operatorToken: string | undefined;
  private readonly chatRateLimiter: InMemoryRateLimiter;
  private readonly chatMutationAdmission: ChatMutationAdmission;
  private readonly maxMessageBytes: number;
  private readonly approvalAuditLog: ApprovalAuditLog;

  constructor(options: ChatSocketControllerOptions) {
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.messageRateLimiter = new ChatSocketMessageRateLimiter(
      options.chatMessageRateLimit ?? options.chatRateLimit ?? DEFAULT_CHAT_MESSAGE_RATE_LIMIT,
    );
    this.runtime = options.runtime;
    this.sessionStore = options.sessionStore;
    this.ticketStore = options.ticketStore ?? new ChatSocketSessionTicketStore();
    this.tokenSecret = options.tokenSecret;
    this.operatorToken = options.operatorToken;
    this.chatRateLimiter = options.chatRateLimiter ?? createChatRateLimiter(options.chatRateLimit ?? DEFAULT_CHAT_RATE_LIMIT);
    this.chatMutationAdmission = options.chatMutationAdmission ?? new ChatMutationAdmission(this.chatRateLimiter);
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_CHAT_SOCKET_MAX_MESSAGE_BYTES;
    this.approvalAuditLog = options.approvalAuditLog ?? new FileApprovalAuditLog();
  }

  authorize(request: ChatSocketConnectRequest): { ok: true } | { ok: false; status: number } {
    const session = this.sessionStore.get(request.sessionId);
    if (!session) {
      return { ok: false, status: 404 };
    }

    const auth = verifyChatSocketRequest({
      allowedOrigins: this.allowedOrigins,
      origin: request.origin,
      sessionId: request.sessionId,
      secret: this.tokenSecret,
      token: request.token,
    });
    if (!auth.ok) {
      return auth;
    }

    if (request.token && this.ticketStore.isConsumed(request.token)) {
      this.auditRejectedTicketReuse(request.sessionId);
      return { ok: false, status: 401 };
    }

    return { ok: true };
  }

  connect(peer: ChatSocketPeer, request: ChatSocketConnectRequest): { ok: true } | { ok: false; status: number } {
    const auth = this.authorize(request);
    if (!auth.ok) {
      return auth;
    }

    if (!request.token || !this.ticketStore.consume(request.token)) {
      this.auditRejectedTicketReuse(request.sessionId);
      return { ok: false, status: 401 };
    }

    const session = this.sessionStore.get(request.sessionId);
    if (!session) {
      return { ok: false, status: 404 };
    }

    createPeerState(
      peer,
      request.sessionId,
      request.remoteAddress,
      this.rateLimitKey(request),
      request.features?.includes('message-kind') ?? false,
      request.features?.includes('usage-stats') ?? false,
      this,
    );
    this.emit(peer, {
      type: 'session.ready',
      sessionId: session.id,
      projectId: session.projectId,
      transcript: session.transcript,
      state: session.state,
      pendingApproval: redactPendingApproval(session.pendingApproval),
    });
    return { ok: true };
  }

  /**
   * `kind` extends the strict v1 completion schema, so it is only included
   * for peers that opted in via the `message-kind` feature.
   */
  private messageKindField(peer: ChatSocketPeer, kind: string): { kind: string } | Record<string, never> {
    return this.connections.get(peer)?.supportsMessageKind ? { kind } : {};
  }

  /**
   * `usage`/`truncated` extend the strict v1 completion schema, so they are
   * only included for peers that opted in via the `usage-stats` feature.
   */
  private usageStatsFields(
    peer: ChatSocketPeer,
    usage: TokenUsage | undefined,
    truncated: boolean | undefined,
  ): { usage?: TokenUsage; truncated?: boolean } {
    if (!this.connections.get(peer)?.supportsUsageStats) {
      return {};
    }
    return { ...(usage ? { usage } : {}), ...(truncated !== undefined ? { truncated } : {}) };
  }

  private auditRejectedTicketReuse(sessionId: string): void {
    console.warn('Rejected reused websocket chat session ticket', { sessionId });
  }

  disconnect(peer: ChatSocketPeer): void {
    this.connections.delete(peer);
  }

  async receive(peer: ChatSocketPeer, raw: string): Promise<void> {
    const connection = this.connections.get(peer);
    if (!connection) {
      this.emit(peer, {
        type: 'turn.error',
        code: 'NO_SESSION',
        message: 'Socket is not bound to a chat session.',
        timestamp: nowIso(),
      });
      return;
    }

    if (Buffer.byteLength(raw, 'utf8') > this.maxMessageBytes) {
      this.emit(peer, {
        type: 'turn.error',
        code: 'MESSAGE_TOO_LARGE',
        message: `Websocket chat event exceeds the ${this.maxMessageBytes} byte limit.`,
        timestamp: nowIso(),
      });
      peer.close(1009, 'Message too large');
      return;
    }

    let event: ClientSocketEvent;
    try {
      event = ClientSocketEventSchema.parse(JSON.parse(raw)) as ClientSocketEvent;
    } catch {
      this.emit(peer, {
        type: 'turn.error',
        code: 'INVALID_EVENT',
        message: 'Invalid websocket chat event.',
        timestamp: nowIso(),
      });
      return;
    }

    const session = this.sessionStore.get(connection.sessionId);
    if (!session) {
      this.emit(peer, {
        type: 'turn.error',
        code: 'NOT_FOUND',
        message: `Session '${connection.sessionId}' not found.`,
        timestamp: nowIso(),
      });
      return;
    }

    switch (event.type) {
      case 'message.send':
        if (!this.takeChatRateLimit(peer, connection)) {
          return;
        }
        await this.handleRateLimitedMessageSend(peer, connection, session, event);
        return;
      case 'approval.respond':
        if ((session.pendingApproval || session.state === 'pending_approval') && !this.takeChatRateLimit(peer, connection)) {
          return;
        }
        await this.runWithSessionTurn(peer, session, () => this.handleApproval(peer, session, event.approved));
        return;
      case 'message.read':
        this.emit(peer, {
          type: 'message.read',
          messageId: event.messageId,
          timestamp: nowIso(),
        });
        return;
      case 'ping':
        this.emit(peer, { type: 'pong', timestamp: nowIso() });
        return;
    }
  }

  private rateLimitKey(request: ChatSocketConnectRequest): string {
    return request.sessionId;
  }

  private emitRateLimitError(peer: ChatSocketPeer, message: string): void {
    this.emit(peer, {
      type: 'turn.error',
      code: 'RATE_LIMITED',
      message,
      timestamp: nowIso(),
    });
  }

  private async handleRateLimitedMessageSend(
    peer: ChatSocketPeer,
    connection: ConnectionState,
    session: ChatSession,
    event: Extract<ClientSocketEvent, { type: 'message.send' }>,
  ): Promise<void> {
    const rateLimit = this.messageRateLimiter.take(connection.rateLimitKey);
    if (!rateLimit.allowed) {
      this.emitRateLimitError(peer, 'WebSocket chat message rate limit exceeded.');
      return;
    }

    await this.runWithSessionTurn(
      peer,
      session,
      () => this.handleMessageSend(
        peer,
        session,
        event.clientMessageId,
        event.content,
        'executionMode' in event ? event.executionMode : undefined,
      ),
    );
  }

  private async runWithSessionTurn(
    peer: ChatSocketPeer,
    session: ChatSession,
    work: () => Promise<void>,
  ): Promise<void> {
    if (!this.chatMutationAdmission.begin(session.id)) {
      this.emitRateLimitError(peer, 'A chat turn is already running for this chat session.');
      return;
    }

    this.activeSessionTurns.add(session.id);
    try {
      await work();
    } finally {
      this.activeSessionTurns.delete(session.id);
      this.chatMutationAdmission.end(session.id);
    }
  }

  private async handleMessageSend(
    peer: ChatSocketPeer,
    session: ChatSession,
    clientMessageId: string,
    content: string,
    executionMode?: 'process' | 'container',
  ): Promise<void> {
    if (session.pendingApproval || session.state === 'pending_approval') {
      this.emit(peer, {
        type: 'turn.error',
        code: 'APPROVAL_PENDING',
        message: 'Approval is pending. Resolve the approval request before sending another message.',
        timestamp: nowIso(),
      });
      return;
    }

    this.emit(peer, {
      type: 'message.accepted',
      clientMessageId,
      sessionId: session.id,
      timestamp: nowIso(),
    });
    this.emit(peer, {
      type: 'message.delivered',
      clientMessageId,
      timestamp: nowIso(),
    });
    this.emit(peer, {
      type: 'message.read',
      clientMessageId,
      timestamp: nowIso(),
    });

    const result = await this.runtime.run(content, {
      sessionId: session.id,
      ...pendingApprovalRuntimeState(session.pendingApproval, session.state === 'pending_approval'),
      projectId: session.projectId,
      transcript: session.transcript,
      ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
      ...(executionMode ? { executionMode } : {}),
    });

    session.transcript = result.transcript;
    session.state = result.state;
    session.pendingApproval = result.pendingApproval && result.pendingApprovalDescription
      ? {
          description: result.pendingApprovalDescription,
          requestedAt: result.pendingApprovalRequestedAt ?? nowIso(),
          ...result.pendingApprovalContext,
        }
      : null;
    session.beastContext = result.beastContext ?? null;
    session.updatedAt = nowIso();
    this.sessionStore.save(session);

    for (const event of result.events) {
      this.emit(peer, mapTurnEvent(event));
    }

    if (session.pendingApproval) {
      this.emit(peer, {
        type: 'turn.approval.requested',
        description: session.pendingApproval.description,
        timestamp: session.pendingApproval.requestedAt,
        ...(session.pendingApproval.tool ? { tool: session.pendingApproval.tool } : {}),
        ...(session.pendingApproval.command ? { command: session.pendingApproval.command } : {}),
        ...(session.pendingApproval.risk ? { risk: session.pendingApproval.risk } : {}),
        ...(session.pendingApproval.affectedFiles ? { affectedFiles: session.pendingApproval.affectedFiles } : {}),
        ...(session.pendingApproval.sessionId ? { sessionId: session.pendingApproval.sessionId } : {}),
      });
    }

    for (const display of result.displayMessages) {
      const contentToSend = display.options && display.options.length > 0
        ? `${display.content}\n${display.options.join(', ')}`
        : display.content;
      const messageId = messageIdFromSession(session);

      if (display.kind === 'reply') {
        this.emit(peer, { type: 'assistant.typing.start', timestamp: nowIso() });
        for (const chunk of splitIntoChunks(contentToSend)) {
          this.emit(peer, {
            type: 'assistant.message.delta',
            messageId,
            chunk,
            ...(display.modelTier ? { modelTier: display.modelTier } : {}),
          });
        }
      }

      this.emit(peer, {
        type: 'assistant.message.complete',
        messageId,
        content: contentToSend,
        ...this.messageKindField(peer, display.kind),
        ...this.usageStatsFields(peer, result.usage, result.truncated),
        ...(display.modelTier ? { modelTier: display.modelTier } : {}),
        timestamp: nowIso(),
      });
    }
  }

  private takeChatRateLimit(
    peer: ChatSocketPeer,
    connection: ConnectionState,
  ): boolean {
    const allowed = this.chatMutationAdmission.takeRateLimit(chatClientKey({
      action: 'message',
      operatorToken: this.operatorToken,
      remoteAddress: connection.remoteAddress,
    }));
    if (allowed) {
      return true;
    }
    this.emit(peer, {
      type: 'turn.error',
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      timestamp: nowIso(),
    });
    return false;
  }

  private async handleApproval(
    peer: ChatSocketPeer,
    session: ChatSession,
    approved: boolean,
  ): Promise<void> {
    if (!session.pendingApproval) {
      if (session.state === 'pending_approval') {
        if (!approved) {
          session.pendingApproval = null;
          session.state = 'rejected';
          session.updatedAt = nowIso();
          this.sessionStore.save(session);
          this.emit(peer, {
            type: 'turn.approval.resolved',
            approved: false,
            timestamp: session.updatedAt,
          });
          this.emit(peer, {
            type: 'assistant.message.complete',
            messageId: deterministicUuid('packages/franken-orchestrator/src/http/ws-chat-server.ts'),
            content: 'Rejected.',
            ...this.messageKindField(peer, 'approval'),
            timestamp: nowIso(),
          });
          return;
        }

        this.emit(peer, {
          type: 'turn.error',
          code: 'APPROVAL_NOT_PENDING',
          message: 'No pending approval metadata exists for this session. Reject or recreate the stale approval state before responding.',
          timestamp: nowIso(),
        });
        return;
      }
      this.emit(peer, {
        type: 'turn.approval.resolved',
        approved: session.state !== 'rejected',
        timestamp: nowIso(),
      });
      return;
    }

    if (!approved) {
      await this.recordApprovalDecision(session, 'denied', 'human', {
        requester: connectionRequester(peer, this.connections),
      });
      session.pendingApproval = null;
      session.state = 'rejected';
      session.updatedAt = nowIso();
      this.sessionStore.save(session);
      this.emit(peer, {
        type: 'turn.approval.resolved',
        approved: false,
        timestamp: session.updatedAt,
      });
      this.emit(peer, {
        type: 'assistant.message.complete',
        messageId: deterministicUuid('packages/franken-orchestrator/src/http/ws-chat-server.ts'),
        content: 'Rejected.',
        ...this.messageKindField(peer, 'approval'),
        timestamp: nowIso(),
      });
      return;
    }

    const pendingApproval = session.pendingApproval;
    let runtimeInput: string;
    try {
      runtimeInput = approvalRuntimeInput(pendingApproval);
    } catch (error) {
      if (error instanceof UnsafeApprovalCommandError) {
        await this.recordApprovalDecision(session, 'skipped', 'parser', {
          reason: error.message,
          requester: connectionRequester(peer, this.connections),
        });
        const timestamp = nowIso();
        this.emit(peer, {
          type: 'turn.error',
          code: 'UNSAFE_APPROVAL_COMMAND',
          message: error.message,
          timestamp,
        });
        if (pendingApproval) {
          this.emit(peer, {
            type: 'turn.approval.requested',
            description: pendingApproval.description,
            timestamp: pendingApproval.requestedAt,
            ...(pendingApproval.tool ? { tool: pendingApproval.tool } : {}),
            ...(pendingApproval.command ? { command: pendingApproval.command } : {}),
            ...(pendingApproval.risk ? { risk: pendingApproval.risk } : {}),
            ...(pendingApproval.affectedFiles ? { affectedFiles: pendingApproval.affectedFiles } : {}),
            ...(pendingApproval.sessionId ? { sessionId: pendingApproval.sessionId } : {}),
          });
        }
        return;
      }
      throw error;
    }
    let approvalConsumed: boolean;
    try {
      approvalConsumed = await this.hasConsumedApproval(session, runtimeInput);
    } catch {
      session.pendingApproval = null;
      session.state = 'rejected';
      session.updatedAt = nowIso();
      this.sessionStore.save(session);
      const timestamp = nowIso();
      this.emit(peer, {
        type: 'turn.error',
        code: 'APPROVAL_AUDIT_UNAVAILABLE',
        message: 'The approval audit log could not be read; recreate the approval request before retrying.',
        timestamp,
      });
      this.emit(peer, {
        type: 'turn.approval.resolved',
        approved: false,
        timestamp,
      });
      return;
    }
    if (approvalConsumed) {
      await this.recordApprovalReplay(session, runtimeInput, 'approval was already consumed', connectionRequester(peer, this.connections));
      session.pendingApproval = null;
      session.state = 'rejected';
      session.updatedAt = nowIso();
      this.sessionStore.save(session);
      const timestamp = nowIso();
      this.emit(peer, {
        type: 'turn.error',
        code: 'APPROVAL_REPLAYED',
        message: 'This approval was already consumed; recreate the approval request before retrying.',
        timestamp,
      });
      this.emit(peer, {
        type: 'turn.approval.resolved',
        approved: false,
        timestamp,
      });
      return;
    }
    await this.recordApprovalDecision(session, 'approved', 'human', {
      requester: connectionRequester(peer, this.connections),
      command: runtimeInput,
    });
    session.pendingApproval = null;
    session.state = 'approved';
    session.updatedAt = nowIso();
    this.sessionStore.save(session);

    this.emit(peer, {
      type: 'turn.approval.resolved',
      approved: true,
      timestamp: session.updatedAt,
    });

    let result: Awaited<ReturnType<ChatRuntime['run']>>;
    try {
      result = await this.runtime.run(runtimeInput, {
        sessionId: session.id,
        pendingApproval: true,
        approvalResolved: true,
        projectId: session.projectId,
        transcript: session.transcript,
        ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
      }, {
        onEvent: (event) => {
          try {
            this.emit(peer, mapTurnEvent(event));
          } catch {
            // Socket delivery is best-effort; do not turn an already-running
            // approved command into a retryable approval execution failure.
          }
        },
      });
    } catch (error) {
      await this.recordApprovalExecution(
        session,
        pendingApproval,
        runtimeInput,
        1,
        error instanceof Error ? error.message : String(error),
        connectionRequester(peer, this.connections),
      );
      session.pendingApproval = null;
      session.state = 'failed';
      session.updatedAt = nowIso();
      this.sessionStore.save(session);
      this.emit(peer, {
        type: 'turn.error',
        code: 'APPROVAL_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Approved action failed to run.',
        timestamp: session.updatedAt,
      });
      return;
    }
    await this.recordApprovalExecution(
      session,
      pendingApproval,
      runtimeInput,
      result.state === 'failed' ? 1 : 0,
      result.displayMessages.map((display) => display.content).join('\n'),
      connectionRequester(peer, this.connections),
    );
    session.pendingApproval = null;
    session.state = result.state === 'active' ? 'approved' : result.state;
    session.beastContext = result.beastContext ?? null;
    session.updatedAt = nowIso();
    this.sessionStore.save(session);

    for (const display of result.displayMessages) {
      this.emit(peer, {
        type: 'assistant.message.complete',
        messageId: deterministicUuid('packages/franken-orchestrator/src/http/ws-chat-server.ts'),
        content: display.content,
        ...this.messageKindField(peer, display.kind),
        ...this.usageStatsFields(peer, result.usage, result.truncated),
        timestamp: nowIso(),
      });
    }
  }

  private async hasConsumedApproval(session: ChatSession, command: string): Promise<boolean> {
    const pendingApproval = session.pendingApproval;
    if (!pendingApproval) return false;
    return this.approvalAuditLog.hasConsumedApproval({
      sessionId: session.id,
      projectId: session.projectId,
      token: approvalAuditToken(session, command),
      commandHash: commandSha256(command),
    });
  }

  private async recordApprovalDecision(
    session: ChatSession,
    decision: 'approved' | 'denied' | 'skipped',
    decisionSource: string,
    options: { readonly command?: string; readonly requester?: string; readonly reason?: string } = {},
  ): Promise<void> {
    const pendingApproval = session.pendingApproval;
    if (!pendingApproval) return;
    const command = options.command ?? pendingApproval.command ?? pendingApproval.description;
    try {
      await this.approvalAuditLog.recordDecision({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditToken(session, command),
        ...(pendingApproval.workerId ? { workerId: pendingApproval.workerId } : {}),
        ...(pendingApproval.workdir ? { workdir: pendingApproval.workdir } : {}),
        ...((options.requester ?? pendingApproval.requester) ? { requester: options.requester ?? pendingApproval.requester } : {}),
        command,
        decision,
        decisionSource,
        ...(options.reason ? { reason: options.reason } : {}),
      });
    } catch {
      // Audit logging is best-effort and must not convert a human decision into
      // a second approval prompt. Replay protection still works when the log is
      // available, and failures are surfaced by package health checks.
    }
  }

  private async recordApprovalExecution(
    session: ChatSession,
    pendingApproval: NonNullable<ChatSession['pendingApproval']>,
    command: string,
    exitCode: number,
    output: string,
    requester?: string,
  ): Promise<void> {
    try {
      await this.approvalAuditLog.recordExecution({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditTokenForPending(session, pendingApproval, command),
        ...(pendingApproval.workerId ? { workerId: pendingApproval.workerId } : {}),
        ...(pendingApproval.workdir ? { workdir: pendingApproval.workdir } : {}),
        ...((requester ?? pendingApproval.requester) ? { requester: requester ?? pendingApproval.requester } : {}),
        command,
        exitCode,
        output,
      });
    } catch {
      // Preserve already-completed approval execution semantics if the optional
      // audit backend is temporarily unavailable.
    }
  }

  private async recordApprovalReplay(
    session: ChatSession,
    command: string,
    reason: string,
    requester?: string,
  ): Promise<void> {
    const pendingApproval = session.pendingApproval;
    if (!pendingApproval) return;
    try {
      await this.approvalAuditLog.recordReplay({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditToken(session, command),
        ...(pendingApproval.workerId ? { workerId: pendingApproval.workerId } : {}),
        ...(pendingApproval.workdir ? { workdir: pendingApproval.workdir } : {}),
        ...((requester ?? pendingApproval.requester) ? { requester: requester ?? pendingApproval.requester } : {}),
        command,
        reason,
      });
    } catch {
      // Replay handling must fail closed at the controller layer even if the
      // attempt cannot be appended to disk.
    }
  }

  private emit(peer: ChatSocketPeer, event: ServerSocketEvent): void {
    const connection = this.connections.get(peer);
    if (!connection || ('eventId' in event && event.eventId)) {
      peer.send(JSON.stringify(event));
      return;
    }

    const nextSequence = (this.eventSequences.get(connection.sessionId) ?? 0) + 1;
    this.eventSequences.set(connection.sessionId, nextSequence);
    peer.send(JSON.stringify({
      eventId: `${connection.sessionId}:${this.eventEpoch}:${nextSequence}`,
      ...event,
    }));
  }
}

function connectionRequester(
  peer: ChatSocketPeer,
  connections: ReadonlyMap<ChatSocketPeer, ConnectionState>,
): string {
  const remoteAddress = connections.get(peer)?.remoteAddress;
  return remoteAddress ? `websocket:${remoteAddress}` : 'websocket';
}

function approvalAuditToken(session: ChatSession, command: string): string {
  if (session.pendingApproval?.approvalToken) return session.pendingApproval.approvalToken;
  return `${session.id}:${session.pendingApproval?.requestedAt ?? 'unknown'}:${commandSha256(command)}`;
}

function approvalAuditTokenForPending(
  session: ChatSession,
  pendingApproval: NonNullable<ChatSession['pendingApproval']>,
  command: string,
): string {
  return pendingApproval.approvalToken ?? `${session.id}:${pendingApproval.requestedAt}:${commandSha256(command)}`;
}

function requestToPeer(ws: WebSocket): ChatSocketPeer {
  return {
    close: (code?: number, reason?: string) => ws.close(code, reason),
    send: (data: string) => ws.send(data),
  };
}

function requestOrigin(request: IncomingMessage): string | null {
  const origin = request.headers.origin;
  return typeof origin === 'string' ? origin : null;
}

function extractChatSocketProtocolAuth(request: IncomingMessage): ChatSocketProtocolAuth {
  const protocols = request.headers['sec-websocket-protocol'];
  const values = Array.isArray(protocols) ? protocols : protocols ? [protocols] : [];
  let hasChatProtocol = false;
  let token: string | null = null;
  for (const value of values) {
    for (const protocol of value.split(',')) {
      const trimmed = protocol.trim();
      if (trimmed === CHAT_SOCKET_PROTOCOL) {
        hasChatProtocol = true;
      } else if (trimmed.startsWith(CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX)) {
        token = trimmed.slice(CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX.length) || null;
      }
    }
  }
  return { hasChatProtocol, token };
}

function closeUnauthorized(
  socket: Duplex,
  status: number,
): void {
  socket.write(`HTTP/1.1 ${status} Unauthorized\r\n\r\n`);
  socket.destroy();
}

function rawPayloadByteLength(payload: RawData): number {
  if (Array.isArray(payload)) {
    return payload.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  return payload.byteLength;
}

function rawPayloadToString(payload: RawData): string {
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString('utf8');
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }
  return Buffer.from(payload).toString('utf8');
}

export function attachChatWebSocketServer(options: AttachChatWebSocketServerOptions) {
  const path = options.path ?? '/v1/chat/ws';
  const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_CHAT_SOCKET_MAX_MESSAGE_BYTES;
  const controller = new ChatSocketController(options);
  const server = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes });

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? '', 'http://localhost');
    if (url.pathname !== path) {
      return;
    }

    const sessionId = url.searchParams.get('sessionId');
    const features = url.searchParams.get('features')?.split(',').filter((feature) => feature.length > 0) ?? [];
    const protocolAuth = extractChatSocketProtocolAuth(request);
    if (!sessionId || !protocolAuth.hasChatProtocol) {
      closeUnauthorized(socket, 400);
      return;
    }
    const { token } = protocolAuth;

    const auth = controller.authorize({
      origin: requestOrigin(request),
      sessionId,
      token,
      remoteAddress: request.socket.remoteAddress,
    });
    if (!auth.ok) {
      closeUnauthorized(socket, auth.status);
      return;
    }
    request.headers['sec-websocket-protocol'] = CHAT_SOCKET_PROTOCOL;

    server.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      const peer = requestToPeer(ws);
      const result = controller.connect(peer, {
        origin: requestOrigin(request),
        sessionId,
        token,
        remoteAddress: request.socket.remoteAddress,
        features,
      });
      if (!result.ok) {
        ws.close();
        return;
      }

      ws.on('message', async (payload: RawData) => {
        if (rawPayloadByteLength(payload) > maxMessageBytes) {
          peer.close(1009, 'Message too large');
          return;
        }
        await controller.receive(peer, rawPayloadToString(payload));
      });
      ws.on('error', () => controller.disconnect(peer));
      ws.on('close', () => controller.disconnect(peer));
    });
  };

  options.server.on('upgrade', onUpgrade);

  return {
    controller,
    server,
    close: () => {
      options.server.off('upgrade', onUpgrade);
      for (const client of server.clients) {
        client.terminate();
      }
      server.close();
    },
  };
}
