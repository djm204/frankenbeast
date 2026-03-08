import { describe, it, expect } from "vitest";
import {
  buildRequest,
  buildNotification,
  parseMessage,
  serializeMessage,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
} from "./json-rpc.js";
import { McpRegistryError } from "../types/mcp-registry-error.js";

describe("buildRequest", () => {
  it("builds a request with params", () => {
    const req = buildRequest(1, "tools/list", { cursor: "abc" });

    expect(req).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { cursor: "abc" },
    });
  });

  it("builds a request without params — no params key in output", () => {
    const req = buildRequest(1, "tools/list");

    expect(req).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect("params" in req).toBe(false);
  });
});

describe("buildNotification", () => {
  it("builds a notification without params — no id key", () => {
    const notif = buildNotification("notifications/initialized");

    expect(notif).toEqual({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect("id" in notif).toBe(false);
  });

  it("builds a notification with params — has params, no id", () => {
    const notif = buildNotification("method", { key: "val" });

    expect(notif).toEqual({
      jsonrpc: "2.0",
      method: "method",
      params: { key: "val" },
    });
    expect("id" in notif).toBe(false);
  });
});

describe("parseMessage", () => {
  it("parses a valid request (has id + method)", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { cursor: "abc" },
    });

    const msg = parseMessage(raw) as JsonRpcRequest;

    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.id).toBe(1);
    expect(msg.method).toBe("tools/list");
    expect(msg.params).toEqual({ cursor: "abc" });
  });

  it("parses a response with result (has id + result)", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    });

    const msg = parseMessage(raw) as JsonRpcResponse;

    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.id).toBe(1);
    expect(msg.result).toEqual({ tools: [] });
    expect(msg.error).toBeUndefined();
  });

  it("parses a response with error (has id + error)", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Invalid Request" },
    });

    const msg = parseMessage(raw) as JsonRpcResponse;

    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.id).toBe(1);
    expect(msg.error).toEqual({ code: -32600, message: "Invalid Request" });
    expect(msg.result).toBeUndefined();
  });

  it("parses a notification (has method but no id)", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    const msg = parseMessage(raw) as JsonRpcNotification;

    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.method).toBe("notifications/initialized");
    expect("id" in msg).toBe(false);
  });

  it("throws McpRegistryError with CALL_FAILED for invalid JSON", () => {
    expect(() => parseMessage("not json")).toThrow(McpRegistryError);
    try {
      parseMessage("not json");
    } catch (e) {
      expect(e).toBeInstanceOf(McpRegistryError);
      expect((e as McpRegistryError).code).toBe("CALL_FAILED");
      expect((e as McpRegistryError).message).toMatch(/Invalid JSON:/);
    }
  });

  it("throws McpRegistryError with CALL_FAILED for missing jsonrpc field", () => {
    expect(() => parseMessage("{}")).toThrow(McpRegistryError);
    try {
      parseMessage("{}");
    } catch (e) {
      expect(e).toBeInstanceOf(McpRegistryError);
      expect((e as McpRegistryError).code).toBe("CALL_FAILED");
      expect((e as McpRegistryError).message).toMatch(
        /missing jsonrpc field/,
      );
    }
  });

  it("throws McpRegistryError for invalid structure (has id but no method, no result, no error)", () => {
    const raw = '{"jsonrpc":"2.0","id":1}';

    expect(() => parseMessage(raw)).toThrow(McpRegistryError);
    try {
      parseMessage(raw);
    } catch (e) {
      expect(e).toBeInstanceOf(McpRegistryError);
      expect((e as McpRegistryError).code).toBe("CALL_FAILED");
      expect((e as McpRegistryError).message).toMatch(
        /Invalid JSON-RPC message/,
      );
    }
  });
});

describe("serializeMessage", () => {
  it("serializes a message to a JSON string", () => {
    const req = buildRequest(1, "tools/list", { cursor: "abc" });
    const serialized = serializeMessage(req);

    expect(typeof serialized).toBe("string");
    expect(serialized).toBe(JSON.stringify(req));
    // Single line, no formatting
    expect(serialized).not.toContain("\n");
  });
});

describe("roundtrip: build -> serialize -> parse", () => {
  it("roundtrips a request with params", () => {
    const original = buildRequest(42, "tools/call", { name: "read_file" });
    const serialized = serializeMessage(original);
    const parsed = parseMessage(serialized);

    expect(parsed).toEqual(original);
  });

  it("roundtrips a request without params", () => {
    const original = buildRequest(7, "tools/list");
    const serialized = serializeMessage(original);
    const parsed = parseMessage(serialized);

    expect(parsed).toEqual(original);
  });

  it("roundtrips a notification", () => {
    const original = buildNotification("notifications/initialized");
    const serialized = serializeMessage(original);
    const parsed = parseMessage(serialized);

    expect(parsed).toEqual(original);
  });

  it("roundtrips a notification with params", () => {
    const original = buildNotification("notifications/progress", {
      token: "abc",
      progress: 50,
    });
    const serialized = serializeMessage(original);
    const parsed = parseMessage(serialized);

    expect(parsed).toEqual(original);
  });
});
