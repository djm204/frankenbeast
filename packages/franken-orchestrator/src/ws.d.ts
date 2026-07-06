declare module 'ws' {
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export interface WebSocket {
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: RawData) => void): this;
    on(event: 'close', listener: () => void): this;
    send(data: string): void;
    terminate(): void;
  }

  export class WebSocketServer {
    constructor(options: { noServer?: boolean });
    clients: Set<WebSocket>;
    close(callback?: (err?: Error) => void): void;
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket) => void,
    ): void;
  }
}
