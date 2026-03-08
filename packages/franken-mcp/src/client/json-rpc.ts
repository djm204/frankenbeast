import { McpRegistryError } from "../types/mcp-registry-error.js";

// ── Types ──────────────────────────────────────────────────────────────

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
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

// ── Builders ───────────────────────────────────────────────────────────

export function buildRequest(
  id: number,
  method: string,
  params?: Record<string, unknown>,
): JsonRpcRequest {
  const req: JsonRpcRequest = { jsonrpc: "2.0", id, method };
  if (params !== undefined) {
    req.params = params;
  }
  return req;
}

export function buildNotification(
  method: string,
  params?: Record<string, unknown>,
): JsonRpcNotification {
  const notif: JsonRpcNotification = { jsonrpc: "2.0", method };
  if (params !== undefined) {
    notif.params = params;
  }
  return notif;
}

// ── Parser ─────────────────────────────────────────────────────────────

export function parseMessage(raw: string): JsonRpcMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new McpRegistryError("CALL_FAILED", `Invalid JSON: ${detail}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new McpRegistryError(
      "CALL_FAILED",
      "Invalid JSON-RPC message",
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["jsonrpc"] !== "2.0") {
    throw new McpRegistryError(
      "CALL_FAILED",
      "Invalid JSON-RPC message: missing jsonrpc field",
    );
  }

  const hasId = "id" in obj;
  const hasMethod = "method" in obj;
  const hasResult = "result" in obj;
  const hasError = "error" in obj;

  // Request: has id + method
  if (hasId && hasMethod) {
    return obj as unknown as JsonRpcRequest;
  }

  // Response: has id + (result or error)
  if (hasId && (hasResult || hasError)) {
    return obj as unknown as JsonRpcResponse;
  }

  // Notification: has method but no id
  if (hasMethod && !hasId) {
    return obj as unknown as JsonRpcNotification;
  }

  throw new McpRegistryError("CALL_FAILED", "Invalid JSON-RPC message");
}

// ── Serializer ─────────────────────────────────────────────────────────

export function serializeMessage(message: JsonRpcMessage): string {
  return JSON.stringify(message);
}
