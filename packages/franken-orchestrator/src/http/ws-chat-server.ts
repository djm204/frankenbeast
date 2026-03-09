import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { ChatRuntime } from '../chat/runtime.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { ChatSession } from '../chat/types.js';
import type { TurnEvent } from '../chat/turn-runner.js';
import {
  verifyChatSocketRequest,
  type VerifyChatSocketRequestOptions,
} from './ws-chat-auth.js';
import {
  ClientSocketEventSchema,
  type ServerSocketEvent,
} from './ws-chat-types.js';

export interface ChatSocketPeer {
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface ConnectionState {
  sessionId: string;
}

export interface ChatSocketControllerOptions {
  allowedOrigins?: string[];
  runtime: ChatRuntime;
  sessionStore: ISessionStore;
  tokenSecret: string;
}

export interface ChatSocketConnectRequest {
  origin: string | null;
  sessionId: string;
  token: string | null;
}

export interface AttachChatWebSocketServerOptions extends ChatSocketControllerOptions {
  path?: string;
  server: HttpServer;
}

function nowIso(): string {
  return new Date().toISOString();
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
      return { type: 'turn.execution.complete', data: event.data as Record<string, unknown> | undefined, timestamp };
    default:
      return { type: 'turn.execution.progress', data: event.data as Record<string, unknown> | undefined, timestamp };
  }
}

function messageIdFromSession(session: ChatSession): string {
  const lastAssistant = [...session.transcript].reverse().find((message) => message.role === 'assistant');
  return lastAssistant?.id ?? randomUUID();
}

function createPeerState(
  peer: ChatSocketPeer,
  sessionId: string,
  controller: ChatSocketController,
): ConnectionState {
  const state = { sessionId };
  controller.connections.set(peer, state);
  return state;
}

export class ChatSocketController {
  readonly connections = new Map<ChatSocketPeer, ConnectionState>();
  private readonly allowedOrigins: string[];
  private readonly runtime: ChatRuntime;
  private readonly sessionStore: ISessionStore;
  private readonly tokenSecret: string;

  constructor(options: ChatSocketControllerOptions) {
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.runtime = options.runtime;
    this.sessionStore = options.sessionStore;
    this.tokenSecret = options.tokenSecret;
  }

  connect(peer: ChatSocketPeer, request: ChatSocketConnectRequest): { ok: true } | { ok: false; status: number } {
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

    createPeerState(peer, request.sessionId, this);
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

    let event;
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
        await this.handleMessageSend(peer, session, event.clientMessageId, event.content);
        return;
      case 'approval.respond':
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
  ): Promise<void> {
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
      pendingApproval: Boolean(session.pendingApproval),
      projectId: session.projectId,
      transcript: session.transcript,
    });

    session.transcript = result.transcript;
    session.state = result.state;
    session.pendingApproval = result.pendingApproval && result.pendingApprovalDescription
      ? { description: result.pendingApprovalDescription, requestedAt: nowIso() }
      : null;
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

  private async handleApproval(
    peer: ChatSocketPeer,
    session: ChatSession,
    approved: boolean,
  ): Promise<void> {
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
        messageId: randomUUID(),
        content: 'Rejected.',
        timestamp: nowIso(),
      });
      return;
    }

    const result = await this.runtime.run('/approve', {
      pendingApproval: Boolean(session.pendingApproval),
      projectId: session.projectId,
      transcript: session.transcript,
    });
    session.pendingApproval = null;
    session.state = result.state;
    session.updatedAt = nowIso();
    this.sessionStore.save(session);

    this.emit(peer, {
      type: 'turn.approval.resolved',
      approved: true,
      timestamp: session.updatedAt,
    });
    for (const display of result.displayMessages) {
      this.emit(peer, {
        type: 'assistant.message.complete',
        messageId: randomUUID(),
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

function closeUnauthorized(
  socket: Duplex,
  status: number,
): void {
  socket.write(`HTTP/1.1 ${status} Unauthorized\r\n\r\n`);
  socket.destroy();
}

export function attachChatWebSocketServer(options: AttachChatWebSocketServerOptions) {
  const path = options.path ?? '/v1/chat/ws';
  const controller = new ChatSocketController(options);
  const server = new WebSocketServer({ noServer: true });

  options.server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    if (url.pathname !== path) {
      return;
    }

    const sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');
    if (!sessionId) {
      closeUnauthorized(socket, 400);
      return;
    }

    const auth = controller.connect(
      {
        close: () => socket.destroy(),
        send: () => undefined,
      },
      {
        origin: requestOrigin(request),
        sessionId,
        token,
      },
    );
    if (!auth.ok) {
      closeUnauthorized(socket, auth.status);
      return;
    }
    controller.disconnect({
      close: () => socket.destroy(),
      send: () => undefined,
    });

    server.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      const peer = requestToPeer(ws);
      const result = controller.connect(peer, {
        origin: requestOrigin(request),
        sessionId,
        token,
      });
      if (!result.ok) {
        ws.close();
        return;
      }

      ws.on('message', async (payload: Buffer | ArrayBuffer | Buffer[]) => {
        await controller.receive(peer, payload.toString());
      });
      ws.on('close', () => controller.disconnect(peer));
    });
  });

  return { controller, server };
}
