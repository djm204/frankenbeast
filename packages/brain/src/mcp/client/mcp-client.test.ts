import { describe, it, expect, vi, afterEach } from "vitest";
import type { IMcpTransport } from "../transport/i-mcp-transport.js";
import type { JsonRpcMessage } from "./json-rpc.js";
import type { ServerConfig } from "../config/config-schema.js";
import { McpClient } from "./mcp-client.js";
import { McpRegistryError } from "../types/mcp-registry-error.js";

// ── Mock transport factory ────────────────────────────────────────────

function makeTransport() {
  let messageHandler: ((msg: JsonRpcMessage) => void) | undefined;
  let closeHandler: ((code: number | null) => void) | undefined;
  let errorHandler: ((err: Error) => void) | undefined;

  const transport: IMcpTransport = {
    spawn: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn((handler) => {
      messageHandler = handler;
    }),
    onError: vi.fn((handler) => {
      errorHandler = handler;
    }),
    onClose: vi.fn((handler) => {
      closeHandler = handler;
    }),
    close: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(true),
  };

  return {
    transport,
    getMessageHandler: () => messageHandler!,
    getCloseHandler: () => closeHandler!,
    getErrorHandler: () => errorHandler!,
  };
}

// ── Auto-respond helper ───────────────────────────────────────────────

function autoRespond(
  transport: IMcpTransport,
  getMessageHandler: () => (msg: JsonRpcMessage) => void,
  result: unknown,
) {
  (transport.send as ReturnType<typeof vi.fn>).mockImplementationOnce(
    (msg: JsonRpcMessage) => {
      if ("id" in msg) {
        setTimeout(() => {
          getMessageHandler()({
            jsonrpc: "2.0",
            id: (msg as { id: number }).id,
            result,
          } as JsonRpcMessage);
        }, 0);
      }
    },
  );
}

function autoRespondError(
  transport: IMcpTransport,
  getMessageHandler: () => (msg: JsonRpcMessage) => void,
  errorPayload: { code: number; message: string },
) {
  (transport.send as ReturnType<typeof vi.fn>).mockImplementationOnce(
    (msg: JsonRpcMessage) => {
      if ("id" in msg) {
        setTimeout(() => {
          getMessageHandler()({
            jsonrpc: "2.0",
            id: (msg as { id: number }).id,
            error: errorPayload,
          } as JsonRpcMessage);
        }, 0);
      }
    },
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────

const baseConfig: ServerConfig = {
  command: "node",
  args: ["server.js", "--stdio"],
  env: { API_KEY: "test-key" },
};

const initResult = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  serverInfo: { name: "test-server", version: "1.0.0" },
};

const toolsListResult = {
  tools: [
    {
      name: "read_file",
      description: "Reads a file from disk",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Writes a file to disk",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  ],
};

const toolCallResult = {
  content: [{ type: "text", text: "file contents here" }],
  isError: false,
};

// ── Helper: connect a client fully ────────────────────────────────────

async function connectClient(
  client: McpClient,
  transport: IMcpTransport,
  getMessageHandler: () => (msg: JsonRpcMessage) => void,
) {
  autoRespond(transport, getMessageHandler, initResult);
  await client.connect();
}

// ── Cleanup ───────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("McpClient", () => {
  describe("connect()", () => {
    it("spawns transport with correct command, args, and env", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      autoRespond(transport, getMessageHandler, initResult);
      await client.connect();

      expect(transport.spawn).toHaveBeenCalledWith(
        "node",
        ["server.js", "--stdio"],
        { API_KEY: "test-key" },
      );
    });

    it("sends initialize then notifications/initialized", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      autoRespond(transport, getMessageHandler, initResult);
      await client.connect();

      expect(transport.send).toHaveBeenCalledTimes(2);

      // First call: initialize request
      const firstCall = (transport.send as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as JsonRpcMessage;
      expect(firstCall).toMatchObject({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "franken-mcp", version: "0.1.0" },
        },
      });
      expect("id" in firstCall).toBe(true);

      // Second call: notifications/initialized notification
      const secondCall = (transport.send as ReturnType<typeof vi.fn>).mock
        .calls[1]![0] as JsonRpcMessage;
      expect(secondCall).toMatchObject({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
      expect("id" in secondCall).toBe(false);
    });

    it("extracts serverInfo from initialize response", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      autoRespond(transport, getMessageHandler, initResult);
      await client.connect();

      expect(client.getServerInfo()).toEqual({
        name: "test-server",
        version: "1.0.0",
      });
    });

    it("sets status to 'connected' after successful connect", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      expect(client.getStatus()).toBe("disconnected");

      autoRespond(transport, getMessageHandler, initResult);
      await client.connect();

      expect(client.getStatus()).toBe("connected");
    });

    it("throws INIT_FAILED on timeout", async () => {
      vi.useFakeTimers();

      const { transport } = makeTransport();
      const config: ServerConfig = {
        ...baseConfig,
        initTimeoutMs: 500,
      };
      const client = new McpClient("test-server", transport, config);

      // Don't auto-respond — let it time out.
      // Attach .catch early so the rejection is "handled" before the timer fires.
      const connectPromise = client.connect().catch((err: unknown) => err);

      await vi.advanceTimersByTimeAsync(500);

      const err = await connectPromise;
      expect(err).toBeInstanceOf(McpRegistryError);
      expect((err as McpRegistryError).code).toBe("INIT_FAILED");
    });

    it("throws INIT_FAILED on error response from server", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      autoRespondError(transport, getMessageHandler, {
        code: -32600,
        message: "Unsupported protocol",
      });

      try {
        await client.connect();
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpRegistryError);
        expect((err as McpRegistryError).code).toBe("INIT_FAILED");
      }

      expect(transport.close).toHaveBeenCalled();
    });

    it("sets status to 'error' on failed connect", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      autoRespondError(transport, getMessageHandler, {
        code: -32600,
        message: "Unsupported protocol",
      });

      try {
        await client.connect();
      } catch {
        // expected
      }

      expect(client.getStatus()).toBe("error");
    });
  });

  describe("listTools()", () => {
    it("sends tools/list and maps response to McpToolDefinition[]", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);
      autoRespond(transport, getMessageHandler, toolsListResult);

      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({
        name: "read_file",
        serverId: "test-server",
        description: "Reads a file from disk",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      });
      // Default constraints (module defaults) applied
      expect(tools[0]!.constraints).toEqual({
        is_destructive: true,
        requires_hitl: true,
        sandbox_type: "DOCKER",
      });
    });

    it("applies server-level constraints to all tools", async () => {
      const config: ServerConfig = {
        ...baseConfig,
        constraints: { is_destructive: false },
      };
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, config);

      await connectClient(client, transport, getMessageHandler);
      autoRespond(transport, getMessageHandler, toolsListResult);

      const tools = await client.listTools();

      expect(tools[0]!.constraints.is_destructive).toBe(false);
      expect(tools[1]!.constraints.is_destructive).toBe(false);
    });

    it("applies per-tool constraint overrides", async () => {
      const config: ServerConfig = {
        ...baseConfig,
        constraints: { is_destructive: false },
        toolOverrides: {
          write_file: {
            constraints: { is_destructive: true, sandbox_type: "WASM" },
          },
        },
      };
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, config);

      await connectClient(client, transport, getMessageHandler);
      autoRespond(transport, getMessageHandler, toolsListResult);

      const tools = await client.listTools();

      // read_file gets server-level override
      expect(tools[0]!.constraints.is_destructive).toBe(false);
      expect(tools[0]!.constraints.sandbox_type).toBe("DOCKER");

      // write_file gets per-tool override
      expect(tools[1]!.constraints.is_destructive).toBe(true);
      expect(tools[1]!.constraints.sandbox_type).toBe("WASM");
    });

    it("stores tools for later retrieval via getTools()", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);
      autoRespond(transport, getMessageHandler, toolsListResult);

      await client.listTools();

      expect(client.getTools()).toHaveLength(2);
      expect(client.getTools()[0]!.name).toBe("read_file");
    });
  });

  describe("callTool()", () => {
    it("sends tools/call with correct params", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);
      autoRespond(transport, getMessageHandler, toolCallResult);

      await client.callTool("read_file", { path: "/tmp/test.txt" });

      // The third send call (after initialize and notifications/initialized)
      const callMsg = (transport.send as ReturnType<typeof vi.fn>).mock
        .calls[2]![0] as JsonRpcMessage;
      expect(callMsg).toMatchObject({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "read_file", arguments: { path: "/tmp/test.txt" } },
      });
    });

    it("returns McpToolResult on success", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);
      autoRespond(transport, getMessageHandler, toolCallResult);

      const result = await client.callTool("read_file", {
        path: "/tmp/test.txt",
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "file contents here" }],
        isError: false,
      });
    });

    it("defaults isError to false when not present in response", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);

      const resultWithoutIsError = {
        content: [{ type: "text", text: "ok" }],
      };
      autoRespond(transport, getMessageHandler, resultWithoutIsError);

      const result = await client.callTool("read_file", {
        path: "/tmp/test.txt",
      });

      expect(result.isError).toBe(false);
    });

    it("throws CALL_FAILED on error response", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);

      autoRespondError(transport, getMessageHandler, {
        code: -32000,
        message: "File not found",
      });

      try {
        await client.callTool("read_file", { path: "/nonexistent" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpRegistryError);
        expect((err as McpRegistryError).code).toBe("CALL_FAILED");
        expect((err as McpRegistryError).message).toBe("File not found");
      }
    });

    it("throws CALL_FAILED on timeout", async () => {
      vi.useFakeTimers();

      const { transport, getMessageHandler } = makeTransport();
      const config: ServerConfig = {
        ...baseConfig,
        callTimeoutMs: 200,
      };
      const client = new McpClient("test-server", transport, config);

      // Connect first with auto-response
      autoRespond(transport, getMessageHandler, initResult);
      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(0);
      await connectPromise;

      // Now make a call that won't be responded to.
      // Attach .catch early so the rejection is "handled" before the timer fires.
      const callPromise = client
        .callTool("read_file", { path: "/tmp/test.txt" })
        .catch((err: unknown) => err);

      await vi.advanceTimersByTimeAsync(200);

      const err = await callPromise;
      expect(err).toBeInstanceOf(McpRegistryError);
      expect((err as McpRegistryError).code).toBe("CALL_FAILED");
      expect((err as McpRegistryError).message).toMatch(/timed out/);
    });

    it("throws SERVER_DISCONNECTED if not connected", async () => {
      const { transport } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      try {
        await client.callTool("read_file", { path: "/tmp/test.txt" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpRegistryError);
        expect((err as McpRegistryError).code).toBe("SERVER_DISCONNECTED");
      }
    });
  });

  describe("disconnect()", () => {
    it("rejects all pending requests with SERVER_DISCONNECTED", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);

      // Start a call that won't be responded to
      const callPromise = client.callTool("read_file", {
        path: "/tmp/test.txt",
      });

      // Disconnect while the request is pending
      await client.disconnect();

      try {
        await callPromise;
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpRegistryError);
        expect((err as McpRegistryError).code).toBe("SERVER_DISCONNECTED");
      }
    });

    it("calls transport.close()", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);
      await client.disconnect();

      expect(transport.close).toHaveBeenCalled();
    });

    it("sets status to 'disconnected'", async () => {
      const { transport, getMessageHandler } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);
      expect(client.getStatus()).toBe("connected");

      await client.disconnect();
      expect(client.getStatus()).toBe("disconnected");
    });
  });

  describe("onClose handler", () => {
    it("sets status to 'disconnected' and rejects pending requests when transport closes", async () => {
      const { transport, getMessageHandler, getCloseHandler } =
        makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      await connectClient(client, transport, getMessageHandler);

      // Start a pending request
      const callPromise = client.callTool("read_file", {
        path: "/tmp/test.txt",
      });

      // Simulate transport close
      getCloseHandler()(1);

      expect(client.getStatus()).toBe("disconnected");

      try {
        await callPromise;
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpRegistryError);
        expect((err as McpRegistryError).code).toBe("SERVER_DISCONNECTED");
      }
    });
  });

  describe("getTools()", () => {
    it("returns empty array before listTools is called", () => {
      const { transport } = makeTransport();
      const client = new McpClient("test-server", transport, baseConfig);

      expect(client.getTools()).toEqual([]);
    });
  });
});
