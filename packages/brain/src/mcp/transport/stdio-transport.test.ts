import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { StdioTransport } from "./stdio-transport.js";
import { buildRequest, serializeMessage } from "../client/json-rpc.js";
import type { JsonRpcMessage } from "../client/json-rpc.js";

// ── Mock child_process ────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn as spawnMock } from "node:child_process";

// ── Helpers ───────────────────────────────────────────────────────────

interface MockChildProcess extends EventEmitter {
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  exitCode: number | null;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
}

function createMockProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  proc.stdin = { write: vi.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.exitCode = null;
  proc.killed = false;
  proc.kill = vi.fn();
  return proc;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("StdioTransport", () => {
  let transport: StdioTransport;
  let mockProc: MockChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new StdioTransport();
    mockProc = createMockProcess();
    vi.mocked(spawnMock).mockReturnValue(mockProc as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── spawn ─────────────────────────────────────────────────────────

  describe("spawn()", () => {
    it("calls child_process.spawn with correct args", () => {
      transport.spawn("node", ["server.js"]);

      expect(spawnMock).toHaveBeenCalledOnce();
      expect(spawnMock).toHaveBeenCalledWith("node", ["server.js"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    });

    it("merges custom env with process.env when env is provided", () => {
      transport.spawn("node", ["server.js"], { MY_VAR: "hello" });

      expect(spawnMock).toHaveBeenCalledOnce();
      expect(spawnMock).toHaveBeenCalledWith("node", ["server.js"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, MY_VAR: "hello" },
      });
    });

    it("does not pass env option when env is undefined", () => {
      transport.spawn("node", ["server.js"]);

      const callArgs = vi.mocked(spawnMock).mock.calls[0];
      const options = callArgs![2] as Record<string, unknown>;
      expect(options).not.toHaveProperty("env");
    });
  });

  // ── send ──────────────────────────────────────────────────────────

  describe("send()", () => {
    it("writes serialized JSON + newline to stdin", () => {
      transport.spawn("node", ["server.js"]);

      const msg = buildRequest(1, "initialize", { protocolVersion: "2024-11-05" });
      transport.send(msg);

      expect(mockProc.stdin.write).toHaveBeenCalledOnce();
      expect(mockProc.stdin.write).toHaveBeenCalledWith(
        serializeMessage(msg) + "\n",
      );
    });
  });

  // ── onMessage ─────────────────────────────────────────────────────

  describe("onMessage()", () => {
    it("fires handler for a complete line on stdout", () => {
      const handler = vi.fn();
      transport.onMessage(handler);
      transport.spawn("node", ["server.js"]);

      const response: JsonRpcMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { capabilities: {} },
      };
      mockProc.stdout.emit("data", Buffer.from(JSON.stringify(response) + "\n"));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(response);
    });

    it("handles partial lines (buffering across two data events)", () => {
      const handler = vi.fn();
      transport.onMessage(handler);
      transport.spawn("node", ["server.js"]);

      const response: JsonRpcMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { ok: true },
      };
      const full = JSON.stringify(response);
      const half = Math.floor(full.length / 2);

      // First chunk: partial line (no newline)
      mockProc.stdout.emit("data", Buffer.from(full.slice(0, half)));
      expect(handler).not.toHaveBeenCalled();

      // Second chunk: rest of line + newline
      mockProc.stdout.emit("data", Buffer.from(full.slice(half) + "\n"));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(response);
    });

    it("handles multiple messages in one chunk", () => {
      const handler = vi.fn();
      transport.onMessage(handler);
      transport.spawn("node", ["server.js"]);

      const msg1: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: { a: 1 } };
      const msg2: JsonRpcMessage = { jsonrpc: "2.0", id: 2, result: { b: 2 } };
      const chunk = JSON.stringify(msg1) + "\n" + JSON.stringify(msg2) + "\n";

      mockProc.stdout.emit("data", Buffer.from(chunk));

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, msg1);
      expect(handler).toHaveBeenNthCalledWith(2, msg2);
    });

    it("skips empty lines", () => {
      const handler = vi.fn();
      transport.onMessage(handler);
      transport.spawn("node", ["server.js"]);

      const msg: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: {} };
      const chunk = "\n\n" + JSON.stringify(msg) + "\n\n";

      mockProc.stdout.emit("data", Buffer.from(chunk));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(msg);
    });
  });

  // ── onError ───────────────────────────────────────────────────────

  describe("onError()", () => {
    it("fires handler on spawn error event", () => {
      const handler = vi.fn();
      transport.onError(handler);
      transport.spawn("node", ["server.js"]);

      const error = new Error("spawn ENOENT");
      mockProc.emit("error", error);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(error);
    });

    it("fires handler on stdout parse error", () => {
      const errorHandler = vi.fn();
      const messageHandler = vi.fn();
      transport.onError(errorHandler);
      transport.onMessage(messageHandler);
      transport.spawn("node", ["server.js"]);

      mockProc.stdout.emit("data", Buffer.from("not-valid-json\n"));

      expect(messageHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledOnce();
      expect(errorHandler.mock.calls[0]![0]).toBeInstanceOf(Error);
    });
  });

  // ── onClose ───────────────────────────────────────────────────────

  describe("onClose()", () => {
    it("fires handler on process close event with exit code", () => {
      const handler = vi.fn();
      transport.onClose(handler);
      transport.spawn("node", ["server.js"]);

      mockProc.emit("close", 0);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(0);
    });

    it("fires handler with null when exit code is null", () => {
      const handler = vi.fn();
      transport.onClose(handler);
      transport.spawn("node", ["server.js"]);

      mockProc.emit("close", null);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(null);
    });
  });

  // ── close ─────────────────────────────────────────────────────────

  describe("close()", () => {
    it("sends SIGTERM then SIGKILL after timeout", async () => {
      vi.useFakeTimers();

      transport.spawn("node", ["server.js"]);

      const closePromise = transport.close();

      expect(mockProc.kill).toHaveBeenCalledOnce();
      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

      // Advance past the 5-second timeout
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockProc.kill).toHaveBeenCalledTimes(2);
      expect(mockProc.kill).toHaveBeenLastCalledWith("SIGKILL");

      // Simulate the process finally closing
      mockProc.exitCode = 137;
      mockProc.emit("close", 137);

      await closePromise;

      vi.useRealTimers();
    });

    it("resolves immediately if process is already dead", async () => {
      transport.spawn("node", ["server.js"]);

      // Simulate process already exited
      mockProc.exitCode = 0;
      mockProc.killed = true;

      await transport.close();

      expect(mockProc.kill).not.toHaveBeenCalled();
    });

    it("resolves when process exits before SIGKILL timeout", async () => {
      vi.useFakeTimers();

      transport.spawn("node", ["server.js"]);

      const closePromise = transport.close();

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

      // Process exits gracefully before timeout
      mockProc.exitCode = 0;
      mockProc.emit("close", 0);

      await closePromise;

      // SIGKILL should never have been sent
      expect(mockProc.kill).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("resolves immediately if never spawned", async () => {
      // close() before spawn() should not throw
      await transport.close();
    });
  });

  // ── isAlive ───────────────────────────────────────────────────────

  describe("isAlive()", () => {
    it("returns true when process is running", () => {
      transport.spawn("node", ["server.js"]);

      expect(transport.isAlive()).toBe(true);
    });

    it("returns false before spawn", () => {
      expect(transport.isAlive()).toBe(false);
    });

    it("returns false after process exits", () => {
      transport.spawn("node", ["server.js"]);

      mockProc.exitCode = 0;

      expect(transport.isAlive()).toBe(false);
    });

    it("returns false after process is killed", () => {
      transport.spawn("node", ["server.js"]);

      mockProc.killed = true;

      expect(transport.isAlive()).toBe(false);
    });
  });

  // ── stderr ────────────────────────────────────────────────────────

  describe("stderr handling", () => {
    it("logs stderr output to console.error with prefix", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      transport.spawn("node", ["server.js"]);

      mockProc.stderr.emit("data", Buffer.from("something went wrong"));

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(
        "[McpTransport]",
        "something went wrong",
      );
    });
  });
});
