import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRegistry } from "./create-registry.js";
import { SkillRegistryError } from "../types/index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock the CLI — no real npx in tests
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
const mockExecFile = vi.mocked(execFile);

const twoGlobalSkills = JSON.stringify([
  {
    skill_id: "deploy-to-vercel",
    metadata: { name: "Deploy", description: "Deploy to Vercel", source: "GLOBAL" },
    interface: { input_schema: { type: "object" }, output_schema: { type: "object" } },
    constraints: { is_destructive: false, requires_hitl: true, sandbox_type: "DOCKER" },
  },
  {
    skill_id: "run-tests",
    metadata: { name: "Run Tests", description: "Run test suite", source: "GLOBAL" },
    interface: { input_schema: { type: "object" }, output_schema: { type: "object" } },
    constraints: { is_destructive: false, requires_hitl: false, sandbox_type: "LOCAL" },
  },
]);

function makeCliSuccess(stdout: string): void {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = callback as (err: null, stdout: string, stderr: string) => void;
    cb(null, stdout, "");
    return {} as ReturnType<typeof execFile>;
  });
}

function makeCliFailure(): void {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = callback as (err: Error, stdout: string, stderr: string) => void;
    cb(new Error("npx failed"), "", "error");
    return {} as ReturnType<typeof execFile>;
  });
}

describe("createRegistry + sync()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sync() populates registry with global skills — isSynced() becomes true", async () => {
    makeCliSuccess(twoGlobalSkills);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    expect(registry.isSynced()).toBe(false);
    await registry.sync();
    expect(registry.isSynced()).toBe(true);
    expect(registry.getAll()).toHaveLength(2);
  });

  it("sync() with local override — local version is returned", async () => {
    makeCliSuccess(twoGlobalSkills);
    const registry = createRegistry({
      localSkillsDir: join(__dirname, "..", "local-loader", "fixtures", "skills"),
    });
    await registry.sync();
    // custom-deploy comes from local; deploy-to-vercel and run-tests from global
    expect(registry.hasSkill("custom-deploy")).toBe(true);
    expect(registry.getSkill("custom-deploy")?.metadata.source).toBe("LOCAL");
    expect(registry.hasSkill("run-tests")).toBe(true);
  });

  it("sync() with malformed CLI stdout — throws SkillRegistryError, registry stays empty", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: null, stdout: string, stderr: string) => void;
      cb(null, "not json {{", "");
      return {} as ReturnType<typeof execFile>;
    });
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await expect(registry.sync()).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillRegistryError && e.code === "PARSE_ERROR",
    );
    expect(registry.isSynced()).toBe(false);
  });

  it("sync() with CLI failure — throws SkillRegistryError(CLI_FAILURE)", async () => {
    makeCliFailure();
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await expect(registry.sync()).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillRegistryError && e.code === "CLI_FAILURE",
    );
  });

  it("sync() with invalid local file — global skills still registered, error logged", async () => {
    makeCliSuccess(twoGlobalSkills);
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = createRegistry({
      localSkillsDir: join(__dirname, "..", "local-loader", "fixtures", "invalid-skills"),
    });
    await registry.sync();
    expect(registry.isSynced()).toBe(true);
    expect(registry.getAll()).toHaveLength(2); // 2 globals survived
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("sync() is idempotent — second call replaces registry state cleanly", async () => {
    makeCliSuccess(twoGlobalSkills);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    expect(registry.getAll()).toHaveLength(2);
    // Second sync with same data
    makeCliSuccess(twoGlobalSkills);
    await registry.sync();
    expect(registry.getAll()).toHaveLength(2);
  });

  it("sync() truly replaces — skill absent from second sync is removed", async () => {
    makeCliSuccess(twoGlobalSkills);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    expect(registry.hasSkill("run-tests")).toBe(true);
    // Second sync returns only one skill
    const oneSkill = JSON.stringify([
      {
        skill_id: "deploy-to-vercel",
        metadata: { name: "Deploy", description: "Deploy to Vercel", source: "GLOBAL" },
        interface: { input_schema: { type: "object" }, output_schema: { type: "object" } },
        constraints: { is_destructive: false, requires_hitl: true, sandbox_type: "DOCKER" },
      },
    ]);
    makeCliSuccess(oneSkill);
    await registry.sync();
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.hasSkill("run-tests")).toBe(false);
  });

  it("debug log emitted per skill after sync()", async () => {
    makeCliSuccess(twoGlobalSkills);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    expect(debugSpy).toHaveBeenCalledTimes(2);
    expect(debugSpy).toHaveBeenCalledWith(
      "[SkillRegistry] Registered skill",
      expect.objectContaining({ skill_id: "deploy-to-vercel", source: "GLOBAL" }),
    );
    debugSpy.mockRestore();
  });

  it("getAll() returns empty array on empty registry (no crash)", async () => {
    makeCliSuccess("[]");
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    expect(registry.getAll()).toHaveLength(0);
  });

  it("override flag present in debug log for locally-overriding skills only", async () => {
    makeCliSuccess(twoGlobalSkills);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const registry = createRegistry({
      localSkillsDir: join(__dirname, "..", "local-loader", "fixtures", "skills"),
    });
    await registry.sync();
    // custom-deploy comes from local only — not an override (no global counterpart)
    // run-tests and deploy-to-vercel come from global only
    const calls = debugSpy.mock.calls.map((c) => c[1] as Record<string, unknown>);
    const overrideCalls = calls.filter((c) => c["override"] === true);
    expect(overrideCalls).toHaveLength(0); // no skill is overriding a global in this fixture
    debugSpy.mockRestore();
  });

  it("getSkill() for unknown id triggers scaffold warn — still returns undefined", async () => {
    makeCliSuccess(twoGlobalSkills);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    const result = registry.getSkill("does-not-exist");
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("does-not-exist"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("getSkill() for known id does not trigger scaffold", async () => {
    makeCliSuccess(twoGlobalSkills);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    const result = registry.getSkill("run-tests");
    expect(result?.skill_id).toBe("run-tests");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
