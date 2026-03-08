import type { IMcpTransport } from "../transport/i-mcp-transport.js";
import type { ServerConfig } from "../config/config-schema.js";
import type { McpToolDefinition } from "../types/mcp-tool-definition.js";
import type { McpToolResult } from "../types/mcp-tool-result.js";
import { resolveConstraints } from "../config/resolve-constraints.js";
import {
  buildRequest,
  buildNotification,
  type JsonRpcMessage,
} from "../client/json-rpc.js";
import { McpRegistryError } from "../types/mcp-registry-error.js";

// ── MCP Client ────────────────────────────────────────────────────────

export class McpClient {
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private status: "connected" | "disconnected" | "error" = "disconnected";
  private mcpServerInfo?: { name: string; version: string };
  private tools: McpToolDefinition[] = [];

  constructor(
    readonly serverId: string,
    private transport: IMcpTransport,
    private config: ServerConfig,
  ) {}

  // ── Public API ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    try {
      // 1. Spawn the transport process
      this.transport.spawn(this.config.command, this.config.args, this.config.env);

      // 2. Register message handler
      this.transport.onMessage((msg) => this.handleMessage(msg));

      // 3. Register close handler
      this.transport.onClose((_code) => {
        this.status = "disconnected";
        this.rejectAllPending(
          new McpRegistryError("SERVER_DISCONNECTED", "Transport closed", this.serverId),
        );
      });

      // 4. Register error handler
      this.transport.onError((_err) => {
        // Errors are handled through the close handler or individual request failures
      });

      // 5. Send initialize request
      const initTimeout = this.config.initTimeoutMs ?? 30_000;
      const result = await this.sendRequest(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "franken-mcp", version: "0.1.0" },
        },
        initTimeout,
      );

      // 6. Extract serverInfo from result
      const initResponse = result as {
        serverInfo?: { name: string; version: string };
      };
      if (initResponse.serverInfo) {
        this.mcpServerInfo = initResponse.serverInfo;
      }

      // 7. Send initialized notification
      this.transport.send(buildNotification("notifications/initialized"));

      // 8. Set status to connected
      this.status = "connected";
    } catch (err) {
      this.status = "error";
      await this.transport.close();

      if (err instanceof McpRegistryError && err.code === "CALL_FAILED") {
        throw new McpRegistryError(
          "INIT_FAILED",
          err.message,
          this.serverId,
        );
      }
      if (err instanceof McpRegistryError) {
        throw err;
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new McpRegistryError(
        "INIT_FAILED",
        detail,
        this.serverId,
      );
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.sendRequest("tools/list");

    const response = result as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    };

    this.tools = response.tools.map((tool) => ({
      name: tool.name,
      serverId: this.serverId,
      description: tool.description,
      inputSchema: tool.inputSchema,
      constraints: resolveConstraints(
        this.config.constraints,
        this.config.toolOverrides?.[tool.name]?.constraints,
      ),
    }));

    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    if (this.status !== "connected") {
      throw new McpRegistryError(
        "SERVER_DISCONNECTED",
        `Server ${this.serverId} is not connected (status: ${this.status})`,
        this.serverId,
        name,
      );
    }

    const result = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });

    const response = result as {
      content: McpToolResult["content"];
      isError?: boolean;
    };

    return {
      content: response.content,
      isError: response.isError ?? false,
    };
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
    this.rejectAllPending(
      new McpRegistryError(
        "SERVER_DISCONNECTED",
        "Client disconnected",
        this.serverId,
      ),
    );
    await this.transport.close();
  }

  getStatus(): "connected" | "disconnected" | "error" {
    return this.status;
  }

  getServerInfo(): { name: string; version: string } | undefined {
    return this.mcpServerInfo;
  }

  getTools(): McpToolDefinition[] {
    return this.tools;
  }

  // ── Private ───────────────────────────────────────────────────────

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown> {
    const id = ++this.requestId;
    const timeout = timeoutMs ?? this.config.callTimeoutMs ?? 30_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new McpRegistryError(
            "CALL_FAILED",
            `Request timed out after ${timeout}ms`,
            this.serverId,
          ),
        );
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.transport.send(buildRequest(id, method, params));
    });
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ("id" in message && !("method" in message)) {
      // This is a response
      const id = (message as { id: number }).id;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);

        const response = message as {
          error?: { code: number; message: string; data?: unknown };
          result?: unknown;
        };

        if (response.error) {
          pending.reject(
            new McpRegistryError(
              "CALL_FAILED",
              response.error.message,
              this.serverId,
            ),
          );
        } else {
          pending.resolve(response.result);
        }
      }
    }
  }

  private rejectAllPending(error: McpRegistryError): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}
