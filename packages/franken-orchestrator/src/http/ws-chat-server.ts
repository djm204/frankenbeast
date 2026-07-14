import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { approvalRuntimeInput, UnsafeApprovalCommandError } from '../chat/approval-input.js';
import { ChatRuntime, pendingApprovalRuntimeState } from '../chat/runtime.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { ChatSession } from '../chat/types.js';
import type { TurnEvent } from '../chat/turn-runner.js';
import {
  ChatSocketSessionTicketStore,
  verifyChatSocketRequest,
} from './ws-chat-auth.js';
import { ClientSocketEventSchema, type ClientSocketEvent, type ServerSocketEvent, deterministicUuid, isoNow } from '@franken/types';
import { InMemoryRateLimiter } from '../beasts/http/beast-rate-limit.js';
import { chatClientKey, createChatRateLimiter, DEFAULT_CHAT_RATE_LIMIT, type ChatRateLimitOptions } from './chat-rate-limit.js';

export interface ChatSocketPeer {
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface ConnectionState {
  sessionId: string;
  remoteAddress?: string | undefined;
}

export interface ChatSocketControllerOptions {
  allowedOrigins?: string[];
  runtime: ChatRuntime;
  sessionStore: ISessionStore;
  ticketStore?: ChatSocketSessionTicketStore;
  tokenSecret: string;
  operatorToken?: string | undefined;
  chatRateLimit?: ChatRateLimitOptions;
  chatRateLimiter?: InMemoryRateLimiter;
  maxMessageBytes?: number;
}

export interface ChatSocketConnectRequest {
  origin: string | null;
  sessionId: string;
  token: string | null;
  remoteAddress?: string | undefined;
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
  controller: ChatSocketController,
): ConnectionState {
  const state = { sessionId, remoteAddress };
  controller.connections.set(peer, state);
  return state;
}

export class ChatSocketController {
  readonly connections = new Map<ChatSocketPeer, ConnectionState>();
  private readonly allowedOrigins: string[];
  private readonly runtime: ChatRuntime;
  private readonly sessionStore: ISessionStore;
  private readonly ticketStore: ChatSocketSessionTicketStore;
  private readonly tokenSecret: string;
  private readonly operatorToken: string | undefined;
  private readonly chatRateLimiter: InMemoryRateLimiter;
  private readonly maxMessageBytes: number;

  constructor(options: ChatSocketControllerOptions) {
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.runtime = options.runtime;
    this.sessionStore = options.sessionStore;
    this.ticketStore = options.ticketStore ?? new ChatSocketSessionTicketStore();
    this.tokenSecret = options.tokenSecret;
    this.operatorToken = options.operatorToken;
    this.chatRateLimiter = options.chatRateLimiter ?? createChatRateLimiter(options.chatRateLimit ?? DEFAULT_CHAT_RATE_LIMIT);
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_CHAT_SOCKET_MAX_MESSAGE_BYTES;
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

    createPeerState(peer, request.sessionId, request.remoteAddress, this);
    this.emit(peer, {
      type: 'session.ready',
      sessionId: session.id,
      projectId: session.projectId,
      transcript: session.transcript,
      state: session.state,
      pendingApproval: session.pendingApproval ?? null,
    });
    return { ok: true };
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
      event = ClientSocketEventSchema.parse(JSON.parse(raw));
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
        await this.handleMessageSend(
          peer,
          session,
          event.clientMessageId,
          event.content,
          'executionMode' in event ? event.executionMode : undefined,
        );
        return;
      case 'approval.respond':
        if ((session.pendingApproval || session.state === 'pending_approval') && !this.takeChatRateLimit(peer, connection)) {
          return;
        }
        await this.handleApproval(peer, session, event.approved);
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
        ...(display.modelTier ? { modelTier: display.modelTier } : {}),
        timestamp: nowIso(),
      });
    }
  }

  private takeChatRateLimit(
    peer: ChatSocketPeer,
    connection: ConnectionState,
  ): boolean {
    const result = this.chatRateLimiter.take(chatClientKey({
      action: 'message',
      operatorToken: this.operatorToken,
      remoteAddress: connection.remoteAddress,
    }));
    if (result.allowed) {
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
        timestamp: nowIso(),
      });
      return;
    }

    const pendingApproval = session.pendingApproval;
    const originalState = session.state;
    let runtimeInput: string;
    try {
      runtimeInput = approvalRuntimeInput(pendingApproval);
    } catch (error) {
      if (error instanceof UnsafeApprovalCommandError) {
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
      session.pendingApproval = pendingApproval;
      session.state = originalState;
      session.updatedAt = nowIso();
      this.sessionStore.save(session);
      this.emit(peer, {
        type: 'turn.error',
        code: 'APPROVAL_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Approved action failed to run.',
        timestamp: session.updatedAt,
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
        timestamp: nowIso(),
      });
    }
  }

  private emit(peer: ChatSocketPeer, event: ServerSocketEvent): void {
    peer.send(JSON.stringify(event));
  }
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
