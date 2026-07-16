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
      prepare: vi.fn(() => ({ all: vi.fn(() => []) })),
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
          "github-token": "ghp_" + "supersecretvalue123456",
          "public-key": "sk-" + "secretvalue123456",
          "deployment-notes":
            "-----BEGIN " +
            "OPENSSH PRIVATE KEY-----\nsecret\n-----END " +
            "OPENSSH PRIVATE KEY-----",
          "status-page": "password=hunter2 session_cookie=abc123value",
          profile: {
            password: "hunter2",
            "alice@example.com": "oncall",
          },
          "object-secret": {
            password: "hunter2",
            "alice@example.com": "oncall",
          },
          "__fbeast_agent_memory__/alpha/private-task": {
            __fbeastMemoryScope: "fbeast:agent-memory",
            agentId: "alpha",
            value: "alpha entry",
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
            summary: "password: hunter2",
            details: {
              apiKey: "sk_" + "secretvalue123456",
              "bob@example.com": "operator",
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "alice@example.com",
            },
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
      limit: 10,
    });
    expect(alphaRows.map((row) => row.key)).toContain("task-1");
    expect(alphaRows.map((row) => row.key)).toContain("private-task");
    expect(alphaRows.map((row) => row.value)).toContain("alpha entry");
    expect(alphaRows.map((row) => row.value)).not.toContain("beta entry");

    const sharedRows = await brain.query({
      query: "entry",
      type: "working",
      readScope: "shared",
      limit: 10,
    });
    expect(sharedRows.map((row) => row.key)).toEqual(["task-1"]);

    const sections = await brain.frontload({
      readScope: "agent",
      agentId: "alpha",
    });
    const text = sections.flatMap((section) => section.entries).join("\n");
    expect(text).toContain("task-1: working entry");
    expect(text).toContain("agents/oncall/runbook: shared runbook");
    expect(text).toContain("private-task: alpha entry");
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
      limit: 10,
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
    expect(serialized).not.toContain("abc123value");
    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("bob@example.com");
    expect(serialized).not.toContain("apiKey");
  });

  it("redacts agent export scope identifiers in safe mode", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const exported = await brain.exportProjectMemory({
      readScope: "agent",
      agentId: "alice@example.com",
      limit: 10,
    });

    expect(exported.scope).toEqual({
      readScope: "agent",
      agentId: "[redacted-email]",
    });
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
