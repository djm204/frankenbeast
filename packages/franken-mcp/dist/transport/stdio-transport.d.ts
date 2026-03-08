import type { JsonRpcMessage } from "../client/json-rpc.js";
import type { IMcpTransport } from "./i-mcp-transport.js";
export declare class StdioTransport implements IMcpTransport {
    private process;
    private buffer;
    private messageHandler;
    private errorHandler;
    private closeHandler;
    spawn(command: string, args: string[], env?: Record<string, string>): void;
    send(message: JsonRpcMessage): void;
    onMessage(handler: (message: JsonRpcMessage) => void): void;
    onError(handler: (error: Error) => void): void;
    onClose(handler: (code: number | null) => void): void;
    close(): Promise<void>;
    isAlive(): boolean;
    private handleStdoutData;
}
