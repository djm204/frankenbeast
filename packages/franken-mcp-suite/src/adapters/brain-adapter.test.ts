import { beforeEach, describe, expect, it, vi } from "vitest";

const { databaseInstances, brainInstances } = vi.hoisted(() => {
  const databaseInstances: Array<{
    pragma: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    options: unknown;
  }> = [];
  const brainInstances: Array<{
    working: {
      restore: ReturnType<typeof vi.fn>;
      snapshot: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      has: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    episodic: {
      recall: ReturnType<typeof vi.fn>;
      recent: ReturnType<typeof vi.fn>;
      record: ReturnType<typeof vi.fn>;
    };
    rightToForget: ReturnType<typeof vi.fn>;
    memoryReview: {
      propose: ReturnType<typeof vi.fn>;
      approve: ReturnType<typeof vi.fn>;
      reject: ReturnType<typeof vi.fn>;
      neverStore: ReturnType<typeof vi.fn>;
    };
    flush: ReturnType<typeof vi.fn>;
  }> = [];
  return { databaseInstances, brainInstances };
});

vi.mock("better-sqlite3", () => ({
  default: vi.fn(function MockDatabase(
    this: unknown,
    _dbPath: string,
    options?: unknown,
  ) {
    const db = {
      pragma: vi.fn(),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn((tableName?: string) => {
          if (sql.includes("sqlite_master") && (tableName === "governor_log" || tableName === "audit_trail")) {
            return { name: tableName };
          }
          return undefined;
        }),
        all: vi.fn(() => {
          if (sql.includes("FROM governor_log")) {
            return [
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-a", profile: "default", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T10:00:00.000Z",
              },
              {
                action: "fbeast_memory_review_decide",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-b", action: "approve" }),
                decision: "approved",
                reason: "reviewed",
                createdAt: "2026-07-16T11:00:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-c", cardId: "t_abc123", profile: "default", repo: "djm204/frankenbeast", type: "working", value: "ghp_secretvalue123456" }),
                decision: "denied",
                reason: "blocked token ghp_secretvalue123456",
                createdAt: "2026-07-16T10:30:00.000Z",
              },
              {
                action: "shell_command",
                context: "rm -rf tmp",
                decision: "review_recommended",
                reason: "dangerous",
                createdAt: "2026-07-16T12:00:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-secret", profile: "security-test", operation: "sk-secretvalue123456", type: "ghp_secretvalue123456" }),
                decision: "validation_error",
                reason: "invalid args",
                createdAt: "2026-07-16T12:10:00.000Z",
              },
              {
                action: "fbeast_memory_right_to_forget",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-dry", profile: "dry-run-test", dryRun: true }),
                decision: "approved",
                reason: "dry run",
                createdAt: "2026-07-16T12:20:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "«redacted:agent…»", profile: "duplicate-test", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T12:30:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", profile: "sparse-duplicate-test", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T12:50:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "[right-to-forget-selector-redacted]", profile: "placeholder-duplicate-test", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T13:00:00.000Z",
              },
              {
                action: "fbeast_memory_right_to_forget",
                context: "[right-to-forget-context-redacted]",
                decision: "approved",
                reason: "dry-run approval",
                createdAt: "2026-07-16T13:10:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" }),
                decision: "approved",
                reason: "allowed first",
                createdAt: "2026-07-16T13:20:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" }),
                decision: "approved",
                reason: "allowed second",
                createdAt: "2026-07-16T13:20:02.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-error-merge", profile: "error-merge-test", type: "working" }),
                decision: "approved",
                reason: "allowed before handler failure",
                createdAt: "2026-07-16T13:30:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-specific", profile: "target-specific-test", repo: "djm204/frankenbeast" }),
                decision: "approved",
                reason: "allowed write",
                createdAt: "2026-07-16T13:50:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ agentId: "agent-forged-governor", profile: "forgery-test", type: "working" }),
                decision: "approved",
                reason: "public governor probe",
                createdAt: "2026-07-16T13:55:00.000Z",
              },
            ];
          }
          if (sql.includes("FROM audit_trail")) {
            return [
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_export", ok: true, profile: "default", repo: "djm204/frankenbeast" }),
                createdAt: "2026-07-16T09:00:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, profile: "duplicate-test", repo: "djm204/frankenbeast", agentId: "agent-actual" }),
                createdAt: "2026-07-16T12:30:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_query", ok: false, profile: "error-test", error: "limit must be numeric" }),
                createdAt: "2026-07-16T12:40:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-sparse", profile: "sparse-duplicate-test", repo: "djm204/frankenbeast", type: "working" } }),
                createdAt: "2026-07-16T12:50:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-placeholder", profile: "placeholder-duplicate-test", repo: "djm204/frankenbeast", type: "working" } }),
                createdAt: "2026-07-16T13:00:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_right_to_forget", ok: true, args: { agentId: "agent-dry-redacted", profile: "rtf-redacted-test", dryRun: true } }),
                createdAt: "2026-07-16T13:10:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_right_to_forget", ok: true, args: { agentId: "agent-dry-redacted", profile: "rtf-redacted-test", dryRun: false } }),
                createdAt: "2026-07-16T13:10:06.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_query", ok: true, args: { agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" } }),
                createdAt: "2026-07-16T13:20:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_query", ok: true, args: { agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" } }),
                createdAt: "2026-07-16T13:20:07.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_query", ok: false, args: { agentId: "agent-error-merge", profile: "error-merge-test", type: "working" }, error: "handler failed" }),
                createdAt: "2026-07-16T13:30:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_query", decision: "sk-secret-decision", args: { agentId: "agent-decision", profile: "decision-secret-test", type: "working" } }),
                createdAt: "2026-07-16T13:40:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-specific", profile: "target-specific-test", repo: "djm204/frankenbeast", type: "episodic" } }),
                createdAt: "2026-07-16T13:50:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "observer-user", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-forged-observer", profile: "forgery-test", type: "working" } }),
                createdAt: "2026-07-16T13:55:05.000Z",
              },
            ];
          }
          return [];
        }),
      })),
      close: vi.fn(),
      options,
    };
    databaseInstances.push(db);
    Object.assign(this as object, db);
  }),
}));

vi.mock("@franken/brain", () => ({
  SqliteBrain: vi.fn(function MockSqliteBrain(this: unknown) {
    const brain = {
      working: {
        restore: vi.fn(),
        snapshot: vi.fn(() => ({
          "task-1": "working entry",
          "agents/oncall/runbook": "shared runbook",
          "temporary-operational": {
            value: "rotate release key",
            category: "temporary-operational",
            sourceScope: "mcp-memory-store",
            expiresAt: "2026-07-16T06:00:00.000Z",
          },
          "github-token": "ghp_" + "supersecretvalue123456",
          "public-key": "sk-" + "secretvalue123456",
          "deployment-notes":
            "-----BEGIN " +
            "OPENSSH PRIVATE KEY-----\nsecret\n-----END " +
            "OPENSSH PRIVATE KEY-----",
          "status-page": "password=hunter2 session_cookie=abc123value",
          "legacy-db-passwd": "legacy-password-alias",
          "ops-note": "slack_webhook_url=https://hooks.slack.com/services/T000/B000/SECRET discord webhook https://discord.com/api/webhooks/1234567890/abcdef_SECRET",
          "env-snippet": "AWS_SECRET_ACCESS_KEY=AKIA" + "supersecretvalue123456 REGION=us-east-1",
          "legacy-token-snippet": "xoxb-" + "legacytokenvalue123 glpat-legacytokenvalue123",
          "basic-auth": "Authorization: Basic " + "dXNlcjpwYXNz",
          "token-auth": "Authorization: Token secret-token-value-that-must-not-leak",
          "db_pwd": "super-pwd-value",
          "db_passwd": "super-passwd-value",
          "slack_webhook_url": "https://hooks.slack.com/services/T000/B000/secretwebhookvalue",
          "ops-notes": "Mirror alerts to https://discord.com/api/webhooks/123456/secretwebhookvalue",

          "json-literal-secrets": '{"password":123456,"token":true,"authToken":{"raw":"«redacted:ghs_…»"},"accessKey":["secretvalue123456"],"safe":"ok"}',
          profile: {
            password: "hunter2",
            "alice@example.com": "oncall",
            "bob@example.com": "backup",
          },
          "object-secret": {
            password: "hunter2",
            nested: { token: 987654 },
            "alice@example.com": "oncall",
          },
          "__fbeast_agent_memory__/alpha/private-task": {
            __fbeastMemoryScope: "fbeast:agent-memory",
            agentId: "alpha",
            value: "private entry",
          },
          "__fbeast_agent_memory__/beta/private-task": {
            __fbeastMemoryScope: "fbeast:agent-memory",
            agentId: "beta",
            value: "beta entry",
          },
        })),
        set: vi.fn(),
        has: vi.fn(() => false),
        delete: vi.fn(),
      },
      episodic: {
        recall: vi.fn(() => [
          {
            id: "evt-1",
            type: "success",
            summary: "episode summary",
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
        recent: vi.fn(() => [
          {
            id: "evt-shared",
            type: "success",
            summary: "password: correct horse battery staple",
            details: {
              apiKey: "sk_" + "secretvalue123456",
              "bob@example.com": "operator",
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "alice@example.com",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-credentialed-uri",
            type: "success",
            summary: "postgres://alice:hunter2@db.internal/app",
            details: {},
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-alpha",
            type: "success",
            summary: "alpha episode",
            details: {
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "alpha",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-beta",
            type: "success",
            summary: "beta episode",
            details: {
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "beta",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
        record: vi.fn(),
      },
      rightToForget: vi.fn(() => ({
        selectorHash: "hash",
        dryRun: false,
        deleted: { working: 1, episodic: 0, derived: 0 },
        remainingReferences: 0,
      })),
      memoryReview: {
        propose: vi.fn((input) => ({
          ...input,
          id: "memcand_1",
          status: "pending",
          createdAt: "2026-07-16T00:00:00.000Z",
          updatedAt: "2026-07-16T00:00:00.000Z",
        })),
        approve: vi.fn(() => ({ id: "memcand_1", status: "approved" })),
        reject: vi.fn(() => ({ id: "memcand_1", status: "rejected" })),
        neverStore: vi.fn(() => ({ id: "memcand_1", status: "never_store" })),
      },
      flush: vi.fn(),
    };
    brainInstances.push(brain);
    Object.assign(this as object, brain);
  }),
}));

import { createBrainAdapter } from "./brain-adapter.js";

describe("createBrainAdapter", () => {
  beforeEach(() => {
    databaseInstances.length = 0;
    brainInstances.length = 0;
    vi.clearAllMocks();
  });

  it("configures WAL and a busy timeout on the adapter read connection before rehydrating memory", () => {
    createBrainAdapter("/tmp/beast.db");

    expect(databaseInstances).toHaveLength(1);
    const readDb = databaseInstances[0];
    expect(readDb.options).toBeUndefined();
    expect(readDb.pragma).toHaveBeenNthCalledWith(1, "journal_mode = WAL");
    expect(readDb.pragma).toHaveBeenNthCalledWith(2, "busy_timeout = 5000");
    expect(readDb.prepare).toHaveBeenCalledWith(
      "SELECT key, value FROM working_memory",
    );
    expect(readDb.close).toHaveBeenCalledOnce();
  });

  it("stores and queries only supported memory types", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    await brain.store({
      key: "task-1",
      value: "working entry",
      type: "working",
    });
    await brain.store({
      key: "evt-1",
      value: "episode summary",
      type: "episodic",
    });

    const mockBrain = brainInstances[0];
    expect(mockBrain.working.set).toHaveBeenCalledWith(
      "task-1",
      "working entry",
    );
    expect(mockBrain.flush).toHaveBeenCalledOnce();
    expect(mockBrain.episodic.record).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "evt-1: episode summary" }),
    );

    const workingResult = await brain.query({
      query: "task",
      type: "working",
      limit: 5,
    });
    expect(
      workingResult.some(
        (row) => row.key === "task-1" && row.type === "working",
      ),
    ).toBe(true);

    const episodicResult = await brain.query({
      query: "episode",
      type: "episodic",
      limit: 5,
    });
    expect(episodicResult.some((row) => row.type === "episodic")).toBe(true);
  });

  it("stores temporary operational working facts with expiresAt metadata when ttlMs is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const brain = createBrainAdapter("/tmp/beast.db");
      await brain.store({ key: "run:tmp", value: "short-lived status", type: "working", ttlMs: 60_000 });

      const mockBrain = brainInstances[0];
      expect(mockBrain.working.set).toHaveBeenCalledWith("run:tmp", {
        value: "short-lived status",
        category: "temporary-operational",
        sourceScope: "mcp-memory-store",
        expiresAt: "2026-01-01T00:01:00.000Z",
      });
      expect(mockBrain.flush).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects unsafe working-memory TTLs before writing memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    for (const invalidTtlMs of [NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        brain.store({ key: "run:tmp", value: "status", type: "working", ttlMs: invalidTtlMs as number }),
      ).rejects.toThrow("ttlMs must be a positive integer");
    }

    expect(mockBrain.working.set).not.toHaveBeenCalled();
    expect(mockBrain.flush).not.toHaveBeenCalled();
  });

  it("rejects ttlMs for episodic memory because episodic records are durable", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await expect(
      brain.store({ key: "evt-ttl", value: "should stay durable", type: "episodic", ttlMs: 60_000 }),
    ).rejects.toThrow("ttlMs is only supported for working memory");

    expect(mockBrain.episodic.record).not.toHaveBeenCalled();
    expect(mockBrain.working.set).not.toHaveBeenCalled();
  });

  it("does not label durable working values with expiresAt fields as TTL-expiring", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];
    mockBrain.working.snapshot.mockReturnValue({
      asset: { value: "certificate metadata", category: "asset", expiresAt: "2099-01-01T00:00:00.000Z" },
      tmp: { value: "runtime status", category: "temporary-operational", expiresAt: "2099-01-01T00:00:00.000Z" },
      tmpAlias: { value: "aliased runtime status", category: "operational-temporary", expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    const result = await brain.query({ query: "", type: "working", limit: 5 });

    expect(result).toEqual([
      { key: "asset", value: JSON.stringify({ value: "certificate metadata", category: "asset", expiresAt: "2099-01-01T00:00:00.000Z" }), type: "working" },
      { key: "tmp", value: "runtime status (expires 2099-01-01T00:00:00.000Z)", type: "working" },
      { key: "tmpAlias", value: "aliased runtime status (expires 2099-01-01T00:00:00.000Z)", type: "working" },
    ]);
  });

  it("rejects unsafe query limits before reading memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    for (const invalidLimit of [
      NaN,
      Infinity,
      0,
      -1,
      1.5,
      1001,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      await expect(
        brain.query({ query: "task", limit: invalidLimit as number }),
      ).rejects.toThrow("limit must be a positive integer between 1 and 1000");
    }

    expect(mockBrain.episodic.recall).not.toHaveBeenCalled();
    expect(mockBrain.working.snapshot).not.toHaveBeenCalled();
  });

  it("filters reads to shared plus matching agent-scoped memory when requested", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const alphaRows = await brain.query({
      query: "entry",
      readScope: "agent",
      agentId: "alpha",
      limit: 30,
    });
    expect(alphaRows.map((row) => row.key)).toContain("task-1");
    expect(alphaRows.map((row) => row.key)).toContain("private-task");
    expect(alphaRows.some((row) => row.key === "private-task" && String(row.value).includes("private entry"))).toBe(true);
    expect(alphaRows.map((row) => row.value)).not.toContain("beta entry");

    const sharedRows = await brain.query({
      query: "entry",
      type: "working",
      readScope: "shared",
      limit: 20,
    });
    expect(sharedRows.map((row) => row.key)).toEqual(["task-1"]);

    const sections = await brain.frontload({
      readScope: "agent",
      agentId: "alpha",
    });
    const text = sections.flatMap((section) => section.entries).join("\n");
    expect(text).toContain("task-1: working entry");
    expect(text).toContain("agents/oncall/runbook: shared runbook");
    expect(text).toContain("private-task: private entry");
    expect(text).toContain("alpha episode");
    expect(text).not.toContain("beta entry");
    expect(text).not.toContain("beta episode");

    const mockBrain = brainInstances[0];
    expect(mockBrain.episodic.recall).toHaveBeenCalledWith("entry", -1);
    expect(mockBrain.episodic.recent).toHaveBeenCalledWith(-1);
  });

  it("exports scoped project memory with safe redaction by default", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const exported = await brain.exportProjectMemory({
      readScope: "shared",
      limit: 20,
    });
    const serialized = JSON.stringify(exported);

    expect(exported.version).toBe(1);
    expect(exported.redaction).toBe("safe");
    expect(exported.scope).toEqual({ readScope: "shared" });
    expect(exported.working.map((entry) => entry.key)).toContain("task-1");
    expect(exported.working.map((entry) => entry.key)).toContain("agents/oncall/runbook");
    expect(exported.working.map((entry) => entry.value)).not.toContain("beta entry");
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("ghp_" + "supersecretvalue123456");
    expect(serialized).not.toContain("sk-" + "secretvalue123456");
    expect(serialized).not.toContain("sk_" + "secretvalue123456");
    expect(serialized).not.toContain("OPENSSH PRIVATE KEY");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("correct horse battery staple");
    expect(serialized).not.toContain("horse battery staple");
    expect(serialized).not.toContain("short-password-alias");
    expect(serialized).not.toContain("legacy-password-alias");
    expect(serialized).not.toContain("hooks.slack.com/services/T000/B000/SECRET");
    expect(serialized).not.toContain("discord.com/api/webhooks/1234567890/abcdef_SECRET");
    expect(serialized).not.toContain("abc123value");
    expect(serialized).not.toContain("super-pwd-value");
    expect(serialized).not.toContain("super-passwd-value");
    expect(serialized).not.toContain("secretwebhookvalue");
    expect(serialized).not.toContain("hooks.slack.com/services");
    expect(serialized).not.toContain("discord.com/api/webhooks");
    expect(serialized).not.toContain("dXNlcjpwYXNz");
    expect(serialized).not.toContain("secret-token-value-that-must-not-leak");
    expect(serialized).not.toContain("postgres://alice:hunter2@db.internal/app");
    expect(serialized).not.toContain("//alice:hunter2@db.internal/app");
    expect(serialized).not.toContain('"password":123456');
    expect(serialized).not.toContain('"token":true');
    expect(serialized).not.toContain("987654");
    expect(serialized).toContain("oncall");
    expect(serialized).toContain("backup");
    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("bob@example.com");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("dXNlcjpwYXNz");
    expect(serialized).not.toContain("secret-token-value-that-must-not-leak");
    expect(serialized).not.toContain("postgres://alice:hunter2");
    expect(serialized).not.toContain("ghs_secretvalue123456");
    expect(serialized).not.toContain("secretvalue123456");
    expect(serialized).not.toContain("AKIA" + "supersecretvalue123456");
    expect(serialized).not.toContain("xoxb-legacytokenvalue123");
    expect(serialized).not.toContain("glpat-legacytokenvalue123");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain('"token":true');
    expect(exported.working).toContainEqual(
      expect.objectContaining({
        key: "temporary-operational",
        value: "rotate release key",
        expiresAt: "2026-07-16T06:00:00.000Z",
      }),
    );
  });

  it("redacts all agent export identifiers in safe mode", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const exported = await brain.exportProjectMemory({
      readScope: "agent",
      agentId: "alpha",
      limit: 40,
    });

    expect(exported.scope).toEqual({
      readScope: "agent",
      agentId: "[redacted-agent-id]",
    });
    expect(exported.working).toContainEqual(expect.objectContaining({
      key: "private-task",
      agentId: "[redacted-agent-id]",
      value: "private entry",
    }));
    const exportedText = JSON.stringify(exported);
    expect(exportedText).not.toContain('"agentId":"alpha"');
    expect(exportedText).not.toContain('"agentId":"beta"');
  });

  it("rejects agent read scope without an agent id before reading memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await expect(
      brain.query({ query: "entry", readScope: "agent", limit: 10 }),
    ).rejects.toThrow("agentId is required when readScope is agent");

    expect(mockBrain.episodic.recall).not.toHaveBeenCalled();
    expect(mockBrain.working.snapshot).not.toHaveBeenCalled();
  });

  it("stores agent-scoped keys and episodic details without lossy agent id normalization", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.store({
      key: "task",
      value: "scoped",
      type: "working",
      agentId: "Alpha Team!",
    });
    await brain.store({
      key: "episode",
      value: "scoped",
      type: "episodic",
      agentId: "Alpha Team!",
    });

    const mockBrain = brainInstances[0];
    expect(mockBrain.working.set).toHaveBeenCalledWith(
      "__fbeast_agent_memory__/Alpha%20Team!/task",
      {
        __fbeastMemoryScope: "fbeast:agent-memory",
        agentId: "Alpha Team!",
        value: "scoped",
      },
    );
    expect(mockBrain.episodic.record).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "episode: scoped",
        details: {
          __fbeastMemoryScope: "fbeast:agent-memory",
          agentId: "Alpha Team!",
        },
      }),
    );
  });

  it("keeps all-scope episodic reads bounded while scoped reads can backfill visible rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await brain.query({ query: "episode", type: "episodic", limit: 7 });
    await brain.frontload();
    await brain.query({
      query: "episode",
      type: "episodic",
      readScope: "shared",
      limit: 7,
    });
    await brain.frontload({ readScope: "shared" });

    expect(mockBrain.episodic.recall).toHaveBeenNthCalledWith(
      1,
      "episode",
      7,
    );
    expect(mockBrain.episodic.recent).toHaveBeenNthCalledWith(1, 100);
    expect(mockBrain.episodic.recall).toHaveBeenNthCalledWith(
      2,
      "episode",
      -1,
    );
    expect(mockBrain.episodic.recent).toHaveBeenNthCalledWith(2, -1);
  });

  it("translates right-to-forget exact keys for agent-scoped working memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.rightToForget({ key: "profile", agentId: "Alpha Team!" });

    expect(brainInstances[0].rightToForget).toHaveBeenCalledWith({
      key: "__fbeast_agent_memory__/Alpha%20Team!/profile",
    });
  });

  it("builds a redacted memory access audit report from governance and observer logs", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "default", limit: 20 });
    const serialized = JSON.stringify(report);

    expect(report.count).toBe(3);
    expect(report.events.map((event) => event.tool)).toEqual([
      "fbeast_memory_store",
      "fbeast_memory_query",
      "fbeast_memory_export",
    ]);
    expect(report.summary.byOperation).toEqual({ write: 1, read: 2 });
    expect(report.summary.byDecision).toEqual({ denied: 1, approved: 2 });
    expect(report.events[0]).toMatchObject({
      agentId: "agent-c",
      cardId: "t_abc123",
      operation: "write",
      targetStore: "working",
      decision: "denied",
    });
    expect(serialized).not.toContain("rm -rf");
    expect(serialized).not.toContain("ghp_secretvalue123456");
  });

  it("filters memory access audit reports by agent, operation, and decision", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({
      agentId: "agent-b",
      operation: "review:approve",
      decision: "approved",
      limit: 20,
    });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-b",
      tool: "fbeast_memory_review_decide",
      operation: "review:approve",
      targetClass: "memory-review-candidate",
      decision: "approved",
    });
  });

  it("does not echo unvalidated operation or type fields in memory access audit reports", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "security-test", limit: 20 });
    const serialized = JSON.stringify(report);

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_query",
      operation: "read",
      targetStore: "working|episodic",
      decision: "validation_error",
    });
    expect(serialized).not.toContain("sk-secretvalue123456");
    expect(serialized).not.toContain("ghp_secretvalue123456");
  });

  it("distinguishes right-to-forget dry runs from deletion activity", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "dry-run-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_right_to_forget",
      operation: "delete:dry_run",
      decision: "approved",
    });
    expect(report.summary.byOperation).toEqual({ "delete:dry_run": 1 });
  });

  it("deduplicates governed and observed memory access events with redacted metadata", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "duplicate-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      source: "audit_trail",
      tool: "fbeast_memory_store",
      operation: "write",
    });

    const agentReport = await brain.memoryAccessAuditReport({ agentId: "agent-actual", profile: "duplicate-test", limit: 20 });
    expect(agentReport.count).toBe(1);
    expect(agentReport.events[0]).toMatchObject({
      agentId: "agent-actual",
      tool: "fbeast_memory_store",
    });
  });

  it("preserves richer observer metadata when deduping sparse governed rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "sparse-duplicate-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_store",
      operation: "write",
      agentId: "agent-sparse",
      profile: "sparse-duplicate-test",
    });
    expect(report.summary.byAgent).toEqual({ "agent-sparse": 1 });
  });

  it("deduplicates nonstandard redaction placeholders with observer metadata", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "placeholder-duplicate-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_store",
      agentId: "agent-placeholder",
      profile: "placeholder-duplicate-test",
    });
  });

  it("keeps dry-run classification when deduping redacted right-to-forget rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_right_to_forget", limit: 20 });

    expect(report.count).toBe(3);
    expect(report.summary.byOperation).toEqual({ "delete:dry_run": 2, delete: 1 });
  });

  it("bounds memory access audit source scans in SQL", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ limit: 5 });

    const prepareSql = databaseInstances.flatMap((db) => db.prepare.mock.calls.map(([sql]) => String(sql)));
    expect(prepareSql.find((sql) => sql.includes("FROM governor_log"))).toContain("LIMIT ?");
    expect(prepareSql.find((sql) => sql.includes("FROM audit_trail"))).toContain("LIMIT ?");
  });

  it("does not cap source scans before applying metadata filters", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ profile: "sparse-duplicate-test", limit: 5 });

    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    expect(prepareSql.find((sql) => sql.includes("FROM governor_log"))).not.toContain("LIMIT ?");
    expect(prepareSql.find((sql) => sql.includes("FROM audit_trail"))).not.toContain("LIMIT ?");
  });

  it("keeps rapid repeated memory accesses as separate audit events", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "rapid-repeat-test", limit: 20 });

    expect(report.count).toBe(2);
    expect(report.summary.byTool).toEqual({ fbeast_memory_query: 2 });
    expect(report.summary.byAgent).toEqual({ "agent-rapid": 2 });
  });

  it("preserves handler failure decisions when merging governed and observed rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "error-merge-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      decision: "error",
      reason: "handler failed",
    });
    expect(report.summary.byDecision).toEqual({ error: 1 });
  });

  it("prefers specific target stores over broad governed defaults", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "target-specific-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      targetStore: "episodic",
    });
  });

  it("does not echo untrusted audit decision strings", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "decision-secret-test", limit: 20 });
    const serialized = JSON.stringify(report);

    expect(report.events[0]).toMatchObject({ decision: "unknown" });
    expect(report.summary.byDecision).toEqual({ unknown: 1 });
    expect(serialized).not.toContain("sk-secret-decision");
  });

  it("ignores caller-forged observer and public governor memory probes", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "forgery-test", limit: 20 });

    expect(report.count).toBe(0);
    expect(report.events).toEqual([]);
  });

  it("classifies failed handler audit events as errors", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "error-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_query",
      decision: "error",
    });
    expect(report.summary.byDecision).toEqual({ error: 1 });
  });

  it("translates memory review proposals for agent-scoped working memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.proposeMemory({
      key: "profile",
      value: "scoped review value",
      source: "test",
      reason: "review",
      confidence: 1,
      agentId: "Alpha Team!",
    });

    expect(brainInstances[0].memoryReview.propose).toHaveBeenCalledWith({
      targetStore: "working",
      key: "__fbeast_agent_memory__/Alpha%20Team!/profile",
      value: "scoped review value",
      source: "test",
      confidence: 1,
      reason: "review",
    });
  });

  it("frontloads approved scoped review values as agent-private entries", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];
    mockBrain.working.snapshot.mockReturnValueOnce({
      "__fbeast_agent_memory__/alpha/approved-secret": "approved scoped value",
    });

    const sharedSections = await brain.frontload({ readScope: "shared" });
    mockBrain.working.snapshot.mockReturnValueOnce({
      "__fbeast_agent_memory__/alpha/approved-secret": "approved scoped value",
    });
    const alphaSections = await brain.frontload({ readScope: "agent", agentId: "alpha" });

    expect(sharedSections.flatMap((section) => section.entries).join("\n")).not.toContain("approved scoped value");
    expect(alphaSections.flatMap((section) => section.entries).join("\n")).toContain("approved-secret: approved scoped value");
  });

  it("fails closed for unsupported memory review actions at the adapter boundary", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await expect(brain.decideMemoryReview({
      id: "memcand_1",
      action: "never-store" as "never_store",
    })).rejects.toThrow("Unsupported memory review action: never-store");

    expect(mockBrain.memoryReview.neverStore).not.toHaveBeenCalled();
  });

  it("rejects unsupported memory type", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await expect(
      brain.store({ key: "k", value: "v", type: "recovery" as string }),
    ).rejects.toThrow(
      "Unsupported memory type: recovery. Supported types: working, episodic",
    );

    await expect(
      brain.query({ query: "any", type: "recovery" as string, limit: 10 }),
    ).rejects.toThrow(
      "Unsupported memory type: recovery. Supported types: working, episodic",
    );
  });
});
