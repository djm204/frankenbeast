import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  ClientSocketEvent,
  ServerSocketEvent
} from '@franken/types';

export interface ChatSocketBridgeOptions {
  url: string;
  sessionId: string;
  token?: string | undefined;
}

export class ChatSocketBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly sessionId: string;
  private readonly token?: string | undefined;

  constructor(options: ChatSocketBridgeOptions) {
    super();
    this.url = options.url;
    this.sessionId = options.sessionId;
    this.token = options.token;
  }

  async connect(): Promise<void> {
    const wsUrl = new URL(this.url);
    wsUrl.searchParams.set('sessionId', this.sessionId);
    if (this.token) {
      wsUrl.searchParams.set('token', this.token);
    }

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl.toString());
      this.ws = socket;

      socket.addEventListener('open', () => {
        this.emit('connected');
        resolve();
      });

      socket.addEventListener('message', (ev) => {
        try {
          const event = JSON.parse(String(ev.data)) as ServerSocketEvent;
          this.emit('event', event);
          this.emit(event.type, event);
        } catch {
          this.emit('error', new Error('Failed to parse server event'));
        }
      });

      socket.addEventListener('error', () => {
        const error = new Error('WebSocket error');
        this.emit('error', error);
        reject(error);
      });

      socket.addEventListener('close', () => {
        this.emit('disconnected');
        this.ws = null;
      });
    });
  }

  async send(content: string): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const clientMessageId = randomUUID();
    const event: ClientSocketEvent = {
      type: 'message.send',
      clientMessageId,
      content,
    };

    this.ws.send(JSON.stringify(event));
    return clientMessageId;
  }

  async respondToApproval(approved: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const event: ClientSocketEvent = {
      type: 'approval.respond',
      approved,
    };

    this.ws.send(JSON.stringify(event));
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
