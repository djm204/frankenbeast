import { McpRegistryError } from "../types/mcp-registry-error.js";
// ── Builders ───────────────────────────────────────────────────────────
export function buildRequest(id, method, params) {
    const req = { jsonrpc: "2.0", id, method };
    if (params !== undefined) {
        req.params = params;
    }
    return req;
}
export function buildNotification(method, params) {
    const notif = { jsonrpc: "2.0", method };
    if (params !== undefined) {
        notif.params = params;
    }
    return notif;
}
// ── Parser ─────────────────────────────────────────────────────────────
export function parseMessage(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new McpRegistryError("CALL_FAILED", `Invalid JSON: ${detail}`);
    }
    if (typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)) {
        throw new McpRegistryError("CALL_FAILED", "Invalid JSON-RPC message");
    }
    const obj = parsed;
    if (obj["jsonrpc"] !== "2.0") {
        throw new McpRegistryError("CALL_FAILED", "Invalid JSON-RPC message: missing jsonrpc field");
    }
    const hasId = "id" in obj;
    const hasMethod = "method" in obj;
    const hasResult = "result" in obj;
    const hasError = "error" in obj;
    // Request: has id + method
    if (hasId && hasMethod) {
        return obj;
    }
    // Response: has id + (result or error)
    if (hasId && (hasResult || hasError)) {
        return obj;
    }
    // Notification: has method but no id
    if (hasMethod && !hasId) {
        return obj;
    }
    throw new McpRegistryError("CALL_FAILED", "Invalid JSON-RPC message");
}
// ── Serializer ─────────────────────────────────────────────────────────
export function serializeMessage(message) {
    return JSON.stringify(message);
}
