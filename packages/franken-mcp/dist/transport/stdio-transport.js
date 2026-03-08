import { spawn as cpSpawn } from "node:child_process";
import { parseMessage, serializeMessage } from "../client/json-rpc.js";
const SIGKILL_TIMEOUT_MS = 5_000;
export class StdioTransport {
    process;
    buffer = "";
    messageHandler;
    errorHandler;
    closeHandler;
    spawn(command, args, env) {
        const options = {
            stdio: ["pipe", "pipe", "pipe"],
        };
        if (env !== undefined) {
            options.env = { ...process.env, ...env };
        }
        this.process = cpSpawn(command, args, options);
        this.process.stdout.on("data", (chunk) => {
            this.handleStdoutData(chunk);
        });
        this.process.stderr.on("data", (chunk) => {
            console.error("[McpTransport]", chunk.toString("utf-8"));
        });
        this.process.on("error", (err) => {
            this.errorHandler?.(err);
        });
        this.process.on("close", (code) => {
            this.closeHandler?.(code);
        });
    }
    send(message) {
        if (this.process === undefined) {
            return;
        }
        this.process.stdin.write(serializeMessage(message) + "\n");
    }
    onMessage(handler) {
        this.messageHandler = handler;
    }
    onError(handler) {
        this.errorHandler = handler;
    }
    onClose(handler) {
        this.closeHandler = handler;
    }
    async close() {
        if (this.process === undefined) {
            return;
        }
        // Already dead — resolve immediately
        if (this.process.exitCode !== null || this.process.killed) {
            return;
        }
        return new Promise((resolve) => {
            const proc = this.process;
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
    isAlive() {
        if (this.process === undefined) {
            return false;
        }
        return this.process.exitCode === null && !this.process.killed;
    }
    // ── Private ─────────────────────────────────────────────────────────
    handleStdoutData(chunk) {
        this.buffer += chunk.toString("utf-8");
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop(); // Keep incomplete last line in buffer
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "")
                continue;
            try {
                const message = parseMessage(trimmed);
                this.messageHandler?.(message);
            }
            catch (err) {
                this.errorHandler?.(err instanceof Error ? err : new Error(String(err)));
            }
        }
    }
}
