import { describe, it, expect, vi } from "vitest";
import type { BrainAdapter } from "../adapters/brain-adapter.js";
import { createToolDefsForServer } from "../shared/tool-registry.js";
import { createMemoryServer } from "./memory.js";

function createBrainStub(overrides: Partial<BrainAdapter> = {}): BrainAdapter {
  return {
    query: vi.fn().mockResolvedValue([]),
    store: vi.fn().mockResolvedValue(undefined),
    frontload: vi.fn().mockResolvedValue([]),
    forget: vi.fn().mockResolvedValue(false),
    rightToForget: vi.fn().mockResolvedValue({
      selectorHash: "hashed-selector",
      dryRun: false,
      deleted: { working: 0, episodic: 0, derived: 0 },
      remainingReferences: 0,
    }),
    proposeMemory: vi.fn().mockResolvedValue({
      id: "memcand_1",
      targetStore: "working",
      key: "user.preference.response-style",
      value: "concise",
      source: "chat:turn-42",
      confidence: 0.92,
      reason: "User explicitly requested concise responses.",
      status: "pending",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    }),
    listMemoryReview: vi.fn().mockResolvedValue([]),
    decideMemoryReview: vi.fn().mockResolvedValue({
      id: "memcand_1",
      targetStore: "working",
      key: "user.preference.response-style",
      value: "concise",
      source: "chat:turn-42",
      confidence: 0.92,
      reason: "User explicitly requested concise responses.",
      status: "approved",
      reviewer: "operator",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      decidedAt: "2026-07-15T00:01:00.000Z",
    }),
    ...overrides,
  };
}

describe("Memory Server", () => {
  it("exposes memory tools including the promotion review queue", () => {
    const server = createMemoryServer({ brain: createBrainStub() });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual([
      "fbeast_memory_store",
      "fbeast_memory_query",
      "fbeast_memory_frontload",
      "fbeast_memory_forget",
      "fbeast_memory_right_to_forget",
      "fbeast_memory_review_propose",
      "fbeast_memory_review_list",
      "fbeast_memory_review_decide",
    ]);
    const storeTool = server.tools.find(
      (t) => t.name === "fbeast_memory_store",
    )!;
    expect(storeTool.description).toBe(
      "Store memory; optional TTL for temporary working facts",
    );
  });

  it("limits memory type enums to working and episodic", () => {
    const storeTool = createMemoryServer({
      brain: createBrainStub(),
    }).tools.find((t) => t.name === "fbeast_memory_store")!;

    const queryTool = createMemoryServer({
      brain: createBrainStub(),
    }).tools.find((t) => t.name === "fbeast_memory_query")!;

    expect(queryTool.inputSchema.properties?.readScope).toMatchObject({
      enum: ["all", "shared", "agent"],
      description: expect.stringContaining("Read scope"),
    });
    expect(queryTool.inputSchema.properties).toHaveProperty("agentId");

    expect(storeTool.inputSchema.properties?.type).toMatchObject({
      enum: ["working", "episodic"],
      description: "Memory type: working or episodic",
    });
    expect(queryTool.inputSchema.properties?.type).toMatchObject({
      enum: ["working", "episodic"],
      description: "Filter by type: working or episodic",
    });
  });

  it("delegates memory store/query/frontload/forget to the brain adapter", async () => {
    const brain = createBrainStub({
      query: vi.fn().mockResolvedValue([
        {
          key: "adr",
          value: "use adapters",
          type: "working",
          createdAt: "2026-04-10T00:00:00.000Z",
        },
      ]),
      store: vi.fn().mockResolvedValue(undefined),
      frontload: vi
        .fn()
        .mockResolvedValue([
          { type: "working", entries: ["adr: use adapters"] },
        ]),
      forget: vi.fn().mockResolvedValue(true),
      rightToForget: vi.fn().mockResolvedValue({
        selectorHash: "hashed-selector",
        dryRun: false,
        deleted: { working: 1, episodic: 1, derived: 1 },
        remainingReferences: 0,
        auditEventId: 42,
      }),
    });

    const server = createMemoryServer({ brain });
    const storeTool = server.tools.find(
      (t) => t.name === "fbeast_memory_store",
    )!;
    const queryTool = server.tools.find(
      (t) => t.name === "fbeast_memory_query",
    )!;
    const frontloadTool = server.tools.find(
      (t) => t.name === "fbeast_memory_frontload",
    )!;
    const forgetTool = server.tools.find(
      (t) => t.name === "fbeast_memory_forget",
    )!;
    const rightToForgetTool = server.tools.find(
      (t) => t.name === "fbeast_memory_right_to_forget",
    )!;

    await storeTool.handler({
      key: "adr",
      value: "use adapters",
      type: "working",
      agentId: "agent-a",
    });
    expect(brain.store).toHaveBeenCalledWith({
      key: "adr",
      value: "use adapters",
      type: "working",
      agentId: "agent-a",
    });

    const queryResult = await queryTool.handler({
      query: "adr",
      type: "working",
      limit: 5,
      readScope: "agent",
      agentId: "agent-a",
    });
    expect(brain.query).toHaveBeenCalledWith({
      query: "adr",
      type: "working",
      limit: 5,
      readScope: "agent",
      agentId: "agent-a",
    });
    expect(queryResult.content[0]!.text).toContain("use adapters");

    expect(frontloadTool.inputSchema.required).toBeUndefined();
    expect(frontloadTool.inputSchema.properties).toHaveProperty("projectId");
    expect(frontloadTool.inputSchema.properties).toHaveProperty("readScope");
    expect(frontloadTool.inputSchema.properties).toHaveProperty("agentId");

    const frontloadResult = await frontloadTool.handler({
      projectId: "test-project",
      readScope: "shared",
    });
    expect(brain.frontload).toHaveBeenCalledWith({ readScope: "shared" });
    expect(frontloadResult.content[0]!.text).toContain("adr: use adapters");

    const forgetResult = await forgetTool.handler({ key: "adr", agentId: "agent-a" });
    expect(brain.forget).toHaveBeenCalledWith("adr", { agentId: "agent-a" });
    expect(forgetResult.content[0]!.text).toContain("Removed memory: adr");

    const deletionResult = await rightToForgetTool.handler({
      category: "pii",
      sourceScope: "import-1",
      query: "secret",
      agentId: "agent-a",
    });
    expect(brain.rightToForget).toHaveBeenCalledWith({
      category: "pii",
      sourceScope: "import-1",
      query: "secret",
      agentId: "agent-a",
    });
    expect(deletionResult.content[0]!.text).toContain("hashed-selector");
    expect(deletionResult.content[0]!.text).not.toContain("secret");
  });

  it("rejects blank agent ids before storing private memory as shared", async () => {
    const brain = createBrainStub({
      query: vi.fn().mockResolvedValue([]),
      store: vi.fn(),
      frontload: vi.fn(),
      forget: vi.fn(),
      rightToForget: vi.fn(),
    });
    const server = createMemoryServer({ brain });
    const storeTool = server.tools.find(
      (t) => t.name === "fbeast_memory_store",
    )!;

    const result = await storeTool.handler({
      key: "adr",
      value: "use adapters",
      type: "working",
      agentId: "   ",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("agentId must be a non-empty string");
    expect(brain.store).not.toHaveBeenCalled();
  });

  it("rejects invalid query limits before calling the brain adapter", async () => {
    for (const invalidLimit of [
      "abc",
      "NaN",
      "Infinity",
      "0",
      "-1",
      "1.5",
      "1001",
      "9007199254740993",
    ]) {
      const brain = createBrainStub({
        query: vi.fn().mockResolvedValue([]),
        store: vi.fn(),
        frontload: vi.fn(),
        forget: vi.fn(),
        rightToForget: vi.fn(),
      });
      const server = createMemoryServer({ brain });
      const result = await server.callTool("fbeast_memory_query", {
        query: "adr",
        limit: invalidLimit,
      });

      expect(result.isError, invalidLimit).toBe(true);
      expect(result.content[0]!.text).toContain(
        "limit must be a positive integer",
      );
      expect(brain.query, invalidLimit).not.toHaveBeenCalled();
    }
  });

  it("applies shared registry query limit defaults and validation", async () => {
    const brain = createBrainStub({
      query: vi.fn().mockResolvedValue([]),
      store: vi.fn(),
      frontload: vi.fn(),
      forget: vi.fn(),
      rightToForget: vi.fn(),
    });
    const queryTool = createToolDefsForServer("memory", { brain }).find(
      (t) => t.name === "fbeast_memory_query",
    )!;

    await queryTool.handler({ query: "adr" });
    await queryTool.handler({ query: "adr", limit: "7" });
    const invalidResult = await queryTool.handler({
      query: "adr",
      limit: "NaN",
    });

    expect(brain.query).toHaveBeenNthCalledWith(1, { query: "adr", limit: 20 });
    expect(brain.query).toHaveBeenNthCalledWith(2, { query: "adr", limit: 7 });
    expect(invalidResult.isError).toBe(true);
    expect(brain.query).toHaveBeenCalledTimes(2);
  });
  it("delegates memory promotion review queue tools with structured output", async () => {
    const brain = createBrainStub({
      listMemoryReview: vi.fn().mockResolvedValue([
        {
          id: "memcand_1",
          targetStore: "working",
          key: "user.preference.response-style",
          value: "concise",
          source: "chat:turn-42",
          confidence: 0.92,
          reason: "User explicitly requested concise responses.",
          status: "pending",
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
      ]),
    });
    const server = createMemoryServer({ brain });

    const proposeResult = await server.callTool("fbeast_memory_review_propose", {
      key: "user.preference.response-style",
      value: "concise",
      source: "chat:turn-42",
      evidenceId: "msg-42",
      confidence: 0.92,
      reason: "User explicitly requested concise responses.",
    });
    expect(brain.proposeMemory).toHaveBeenCalledWith({
      key: "user.preference.response-style",
      value: "concise",
      source: "chat:turn-42",
      evidenceId: "msg-42",
      confidence: 0.92,
      reason: "User explicitly requested concise responses.",
    });
    expect(JSON.parse(proposeResult.content[0]!.text)).toMatchObject({ id: "memcand_1", status: "pending" });

    const listResult = await server.callTool("fbeast_memory_review_list", { status: "pending" });
    expect(brain.listMemoryReview).toHaveBeenCalledWith("pending");
    expect(JSON.parse(listResult.content[0]!.text)).toMatchObject({ status: "pending", count: 1 });

    const decideResult = await server.callTool("fbeast_memory_review_decide", {
      id: "memcand_1",
      action: "approve",
      reviewer: "operator",
      note: "Confirmed.",
    });
    expect(brain.decideMemoryReview).toHaveBeenCalledWith({
      id: "memcand_1",
      action: "approve",
      options: { reviewer: "operator", note: "Confirmed." },
    });
    expect(JSON.parse(decideResult.content[0]!.text)).toMatchObject({ id: "memcand_1", status: "approved" });
  });

  it("rejects invalid memory review queue input before calling the brain adapter", async () => {
    const brain = createBrainStub();
    const server = createMemoryServer({ brain });

    const badConfidence = await server.callTool("fbeast_memory_review_propose", {
      key: "user.preference.response-style",
      value: "concise",
      source: "chat:turn-42",
      confidence: 2,
      reason: "Out of range.",
    });
    expect(badConfidence.isError).toBe(true);
    expect(badConfidence.content[0]!.text).toContain("confidence must be a number between 0 and 1");
    expect(brain.proposeMemory).not.toHaveBeenCalled();

    const badAction = await server.callTool("fbeast_memory_review_decide", {
      id: "memcand_1",
      action: "maybe",
    });
    expect(badAction.isError).toBe(true);
    expect(badAction.content[0]!.text).toContain("action must be one of");
    expect(brain.decideMemoryReview).not.toHaveBeenCalled();
  });
});

describe("Memory Server read scope validation", () => {
  it("rejects agent read scope without agentId before calling the adapter", async () => {
    const brain = createBrainStub({
      query: vi.fn().mockResolvedValue([]),
      store: vi.fn(),
      frontload: vi.fn(),
      forget: vi.fn(),
      rightToForget: vi.fn(),
    });
    const server = createMemoryServer({ brain });

    const queryResult = await server.callTool("fbeast_memory_query", {
      query: "adr",
      readScope: "agent",
    });
    const frontloadResult = await server.callTool("fbeast_memory_frontload", {
      readScope: "agent",
    });

    expect(queryResult.isError).toBe(true);
    expect(queryResult.content[0]!.text).toContain("agentId is required");
    expect(frontloadResult.isError).toBe(true);
    expect(frontloadResult.content[0]!.text).toContain("agentId is required");
    expect(brain.query).not.toHaveBeenCalled();
    expect(brain.frontload).not.toHaveBeenCalled();
  });
});
