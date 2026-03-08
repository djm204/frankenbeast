export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: Record<string, unknown>;
}
export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
}
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
export declare function buildRequest(id: number, method: string, params?: Record<string, unknown>): JsonRpcRequest;
export declare function buildNotification(method: string, params?: Record<string, unknown>): JsonRpcNotification;
export declare function parseMessage(raw: string): JsonRpcMessage;
export declare function serializeMessage(message: JsonRpcMessage): string;
