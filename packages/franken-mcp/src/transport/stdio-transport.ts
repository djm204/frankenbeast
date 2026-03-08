import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import type { JsonRpcMessage } from "../client/json-rpc.js";
import { parseMessage, serializeMessage } from "../client/json-rpc.js";
import type { IMcpTransport } from "./i-mcp-transport.js";

const SIGKILL_TIMEOUT_MS = 5_000;

export class StdioTransport implements IMcpTransport {
  private process: ChildProcess | undefined;
  private buffer = "";
  private messageHandler: ((message: JsonRpcMessage) => void) | undefined;
  private errorHandler: ((error: Error) => void) | undefined;
  private closeHandler: ((code: number | null) => void) | undefined;

  spawn(
    command: string,
    args: string[],
    env?: Record<string, string>,
  ): void {
    const options: { stdio: ["pipe", "pipe", "pipe"]; env?: NodeJS.ProcessEnv } = {
      stdio: ["pipe", "pipe", "pipe"],
    };

    if (env !== undefined) {
      options.env = { ...process.env, ...env };
    }

    this.process = cpSpawn(command, args, options);

    this.process.stdout!.on("data", (chunk: Buffer) => {
      this.handleStdoutData(chunk);
    });

    this.process.stderr!.on("data", (chunk: Buffer) => {
      console.error("[McpTransport]", chunk.toString("utf-8"));
    });

    this.process.on("error", (err: Error) => {
      this.errorHandler?.(err);
    });

    this.process.on("close", (code: number | null) => {
      this.closeHandler?.(code);
    });
  }

  send(message: JsonRpcMessage): void {
    if (this.process === undefined) {
      return;
    }
    this.process.stdin!.write(serializeMessage(message) + "\n");
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: (code: number | null) => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    if (this.process === undefined) {
      return;
    }

    // Already dead — resolve immediately
    if (this.process.exitCode !== null || this.process.killed) {
      return;
    }

    return new Promise<void>((resolve) => {
      const proc = this.process!;

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
      }, SIGKILL_TIMEOUT_MS);

      proc.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill("SIGTERM");
    });
  }

  isAlive(): boolean {
    if (this.process === undefined) {
      return false;
    }
    return this.process.exitCode === null && !this.process.killed;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private handleStdoutData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf-8");
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop()!; // Keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      try {
        const message = parseMessage(trimmed);
        this.messageHandler?.(message);
      } catch (err) {
        this.errorHandler?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}
