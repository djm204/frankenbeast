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
            summary: "episode summary",
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
        recent: vi.fn(() => [
          {
            id: "evt-shared",
            summary: "shared episode",
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-alpha",
            summary: "alpha episode",
            details: {
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "alpha",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-beta",
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
