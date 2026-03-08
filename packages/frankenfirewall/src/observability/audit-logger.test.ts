import { describe, it, expect, vi } from "vitest";
import { AuditLogger } from "./audit-logger.js";

describe("AuditLogger", () => {
  it("writes a structured JSON entry for every log() call", () => {
    const entries: unknown[] = [];
    const logger = new AuditLogger({ write: (e) => entries.push(e) });

    const entry = logger.buildEntry({
      requestId: "req-001",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      violations: [],
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      startedAt: Date.now() - 42,
    });
    logger.log(entry);

    expect(entries).toHaveLength(1);
    const logged = entries[0] as typeof entry;
    expect(logged.request_id).toBe("req-001");
    expect(logged.provider).toBe("anthropic");
    expect(logged.outcome).toBe("pass");
    expect(logged.duration_ms).toBeGreaterThanOrEqual(0);
    expect(logged.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets outcome to blocked when violations exist", () => {
    const entries: unknown[] = [];
    const logger = new AuditLogger({ write: (e) => entries.push(e) });

    const entry = logger.buildEntry({
      requestId: "req-002",
      provider: "openai",
      model: "gpt-4o",
      violations: [{ code: "INJECTION_DETECTED", message: "blocked", interceptor: "InjectionScanner" }],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      startedAt: Date.now(),
    });
    logger.log(entry);

    const logged = entries[0] as typeof entry;
    expect(logged.outcome).toBe("blocked");
    expect(logged.violations).toHaveLength(1);
  });

  it("written entry includes all required AuditEntry fields", () => {
    const entries: unknown[] = [];
    const logger = new AuditLogger({ write: (e) => entries.push(e) });

    const entry = logger.buildEntry({
      requestId: "req-003",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      sessionId: "session-abc",
      violations: [],
      inputTokens: 200,
      outputTokens: 100,
      costUsd: 0.005,
      startedAt: Date.now(),
    });
    logger.log(entry);

    const logged = entries[0] as Record<string, unknown>;
    const required = [
      "timestamp", "request_id", "provider", "model",
      "interceptors_run", "violations", "outcome",
      "input_tokens", "output_tokens", "cost_usd", "duration_ms",
    ];
    for (const field of required) {
      expect(logged).toHaveProperty(field);
    }
    expect(logged["session_id"]).toBe("session-abc");
  });

  it("log is written for every pipeline call regardless of outcome", () => {
    const entries: unknown[] = [];
    const logger = new AuditLogger({ write: (e) => entries.push(e) });

    // Simulate pass
    logger.log(logger.buildEntry({ requestId: "r1", provider: "anthropic", model: "m", violations: [], inputTokens: 0, outputTokens: 0, costUsd: 0, startedAt: Date.now() }));
    // Simulate block
    logger.log(logger.buildEntry({ requestId: "r2", provider: "anthropic", model: "m", violations: [{ code: "PII_DETECTED", message: "pii", interceptor: "PiiMasker" }], inputTokens: 0, outputTokens: 0, costUsd: 0, startedAt: Date.now() }));

    expect(entries).toHaveLength(2);
  });
});
