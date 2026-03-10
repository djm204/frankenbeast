import type { JsonRpcMessage } from "../client/json-rpc.js";

export interface IMcpTransport {
  spawn(command: string, args: string[], env?: Record<string, string>): void;
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: (code: number | null) => void): void;
  close(): Promise<void>;
  isAlive(): boolean;
}
