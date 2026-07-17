import { beforeEach, describe, expect, it, vi } from "vitest";

const { databaseInstances, brainInstances, workingMemoryRowsByPath } = vi.hoisted(() => {
  const workingMemoryRowsByPath = new Map<string, Array<{ key: string; value: string }>>();
  const databaseInstances: Array<{
    pragma: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    dbPath: string;
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
      listProvenance: ReturnType<typeof vi.fn>;
      conflictsFor: ReturnType<typeof vi.fn>;
      resolveConflict: ReturnType<typeof vi.fn>;
    };
    flush: ReturnType<typeof vi.fn>;
  }> = [];
  return { databaseInstances, brainInstances, workingMemoryRowsByPath };
});

vi.mock("better-sqlite3", () => ({
  default: vi.fn(function MockDatabase(
    this: unknown,
    _dbPath: string,
    options?: unknown,
  ) {
    const db = {
      pragma: vi.fn(),
      prepare: vi.fn(() => ({ all: vi.fn(() => workingMemoryRowsByPath.get(_dbPath) ?? []) })),
      close: vi.fn(),
      dbPath: _dbPath,
      options,
    };
    databaseInstances.push(db);
    Object.assign(this as object, db);
  }),
}));

vi.mock("@franken/brain", () => ({
  SqliteBrain: vi.fn(function MockSqliteBrain(this: unknown) {
    let workingSnapshot: Record<string, unknown> = {
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
      "basic-auth": "Authorization: *** " + "dXNlcjpwYXNz",
      "token-auth": "Authorization: Token secret...leak",
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
    };
    const brain = {
      working: {
        restore: vi.fn((snapshot: Record<string, unknown>) => {
          workingSnapshot = snapshot;
        }),
        snapshot: vi.fn(() => workingSnapshot),
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
        propose: vi.fn((input: Record<string, unknown>) => ({
          ...input,
          id: "memcand_1",
          status: "pending",
          createdAt: "2026-07-16T00:00:00.000Z",
          updatedAt: "2026-07-16T00:00:00.000Z",
        })),
        approve: vi.fn(() => ({ id: "memcand_1", status: "approved" })),
        reject: vi.fn(() => ({ id: "memcand_1", status: "rejected" })),
        neverStore: vi.fn(() => ({ id: "memcand_1", status: "never_store" })),
        listProvenance: vi.fn((options?: {
          key?: string;
          keys?: string[];
          limit?: number;
          visibleKeyPrefixes?: string[];
          includeUnprefixedKeys?: boolean;
          unprefixedKeyPrefixExclusions?: string[];
          excludeKeyPrefixes?: string[];
        }) => {
          const rows = [
            {
              targetStore: "working",
              key: "task-1",
              value: "working entry",
              candidateId: "memcand_shared",
              source: "shared-source",
              confidence: 0.9,
              reason: "shared",
              approvedAt: "2026-07-16T00:00:00.000Z",
            },
            {
              targetStore: "working",
              key: "__fbeast_agent_memory__/alpha/private-task",
              value: {
                __fbeastMemoryScope: "fbeast:agent-memory",
                agentId: "alpha",
                value: "alpha entry",
              },
              candidateId: "memcand_alpha",
              source: "alpha-source",
              confidence: 0.9,
              reason: "alpha",
              approvedAt: "2026-07-16T00:01:00.000Z",
            },
            {
              targetStore: "working",
              key: "__fbeast_agent_memory__/beta/private-task",
              value: {
                __fbeastMemoryScope: "fbeast:agent-memory",
                agentId: "beta",
                value: "beta entry",
              },
              candidateId: "memcand_beta",
              source: "beta-source",
              confidence: 0.9,
              reason: "beta",
              approvedAt: "2026-07-16T00:02:00.000Z",
            },
          ];
          let filtered = rows;
          if (options?.key !== undefined) {
            filtered = filtered.filter((row) => row.key === options.key);
          }
          if (options?.keys !== undefined) {
            filtered = filtered.filter((row) => options.keys!.includes(row.key));
          }
          for (const prefix of options?.excludeKeyPrefixes ?? []) {
            filtered = filtered.filter((row) => !row.key.startsWith(prefix));
          }
          if ((options?.visibleKeyPrefixes?.length ?? 0) > 0) {
            const visiblePrefixes = options!.visibleKeyPrefixes!;
            const unprefixedExclusions = options!.unprefixedKeyPrefixExclusions ?? visiblePrefixes;
            filtered = filtered.filter((row) =>
              visiblePrefixes.some((prefix) => row.key.startsWith(prefix))
              || (options!.includeUnprefixedKeys === true
                && unprefixedExclusions.every((prefix) => !row.key.startsWith(prefix))),
            );
          }
          return filtered.slice(0, options?.limit ?? filtered.length);
        }),
        conflictsFor: vi.fn(() => []),
        resolveConflict: vi.fn(() => ({ id: "memcand_1", status: "approved" })),
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
    workingMemoryRowsByPath.clear();
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

  it("keeps direct API memory reads isolated by profile database path", async () => {
    workingMemoryRowsByPath.set("/tmp/profiles/default/beast.db", [
      { key: "profile-note", value: JSON.stringify("default profile memory") },
    ]);
    workingMemoryRowsByPath.set("/tmp/profiles/doctor/beast.db", [
      { key: "profile-note", value: JSON.stringify("doctor profile memory") },
    ]);

    const defaultProfile = createBrainAdapter("/tmp/profiles/default/beast.db");
    const doctorProfile = createBrainAdapter("/tmp/profiles/doctor/beast.db");

    const defaultRows = await defaultProfile.query({
      query: "profile memory",
      type: "working",
      readScope: "shared",
      limit: 10,
    });
    const doctorRows = await doctorProfile.query({
      query: "profile memory",
      type: "working",
      readScope: "shared",
      limit: 10,
    });

    expect(defaultRows).toEqual([
      { key: "profile-note", value: "default profile memory", type: "working" },
    ]);
    expect(doctorRows).toEqual([
      { key: "profile-note", value: "doctor profile memory", type: "working" },
    ]);
    expect(databaseInstances.map((db) => db.dbPath)).toEqual([
      "/tmp/profiles/default/beast.db",
      "/tmp/profiles/doctor/beast.db",
    ]);
    expect(brainInstances[0]!.working.restore).toHaveBeenCalledWith({
      "profile-note": "default profile memory",
    });
    expect(brainInstances[1]!.working.restore).toHaveBeenCalledWith({
      "profile-note": "doctor profile memory",
    });
    expect(JSON.stringify(defaultRows)).not.toContain("doctor profile memory");
    expect(JSON.stringify(doctorRows)).not.toContain("default profile memory");
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

  it("filters memory attribution by read scope and redacts internal scoped keys", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    const sharedAttribution = await brain.memoryAttribution({ readScope: "shared", limit: 10 });
    const alphaAttribution = await brain.memoryAttribution({ readScope: "agent", agentId: "alpha", limit: 10 });
    const alphaExactAttribution = await brain.memoryAttribution({ key: "private-task", readScope: "agent", agentId: "alpha", limit: 10 });

    expect(sharedAttribution.map((row) => row.key)).toEqual(["task-1"]);
    expect(sharedAttribution.map((row) => row.value)).not.toContain("alpha entry");
    expect(alphaAttribution.map((row) => row.key)).toEqual(["task-1", "private-task"]);
    expect(alphaAttribution.map((row) => row.value)).toEqual(["working entry", "alpha entry"]);
    expect(alphaAttribution.map((row) => row.key).join("\n")).not.toContain("__fbeast_agent_memory__");
    expect(alphaExactAttribution.map((row) => row.key)).toEqual(["private-task"]);
    expect(mockBrain.memoryReview.listProvenance).toHaveBeenLastCalledWith({
      keys: ["private-task", "__fbeast_agent_memory__/alpha/private-task"],
      limit: 10,
    });
  });

  it("preserves structured memory attribution values while decoding scoped keys", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];
    const structuredValue = { nested: { enabled: true }, count: 2 };
    mockBrain.memoryReview.listProvenance.mockReturnValueOnce([
      {
        targetStore: "working",
        key: "structured-memory",
        value: structuredValue,
        candidateId: "memcand_structured",
        source: "shared-source",
        confidence: 0.9,
        reason: "structured",
        approvedAt: "2026-07-16T00:00:00.000Z",
      },
    ]);

    const attributions = await brain.memoryAttribution({ readScope: "shared" });

    expect(attributions).toHaveLength(1);
    expect(attributions[0]!.key).toBe("structured-memory");
    expect(attributions[0]!.value).toEqual(structuredValue);
  });

  it("uses attribution defaults and pre-filters scoped provenance before enforcing limits", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await brain.memoryAttribution({ readScope: "shared" });
    await brain.memoryAttribution({ readScope: "agent", agentId: "alpha" });

    expect(mockBrain.memoryReview.listProvenance).toHaveBeenNthCalledWith(1, {
      excludeKeyPrefixes: ["__fbeast_agent_memory__/"],
      limit: 50,
    });
    expect(mockBrain.memoryReview.listProvenance).toHaveBeenNthCalledWith(2, {
      visibleKeyPrefixes: ["__fbeast_agent_memory__/alpha/"],
      includeUnprefixedKeys: true,
      unprefixedKeyPrefixExclusions: ["__fbeast_agent_memory__/"],
      limit: 50,
    });
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
