import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRegistry } from "./create-registry.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
const mockExecFile = vi.mocked(execFile);

function makeSkill(i: number): object {
  return {
    skill_id: `skill-${i}`,
    metadata: { name: `Skill ${i}`, description: `Description for skill ${i}`, source: "GLOBAL" },
    interface: { input_schema: { type: "object" }, output_schema: { type: "object" } },
    constraints: { is_destructive: false, requires_hitl: false, sandbox_type: "LOCAL" },
  };
}

function makeCliWithN(n: number): void {
  const skills = Array.from({ length: n }, (_, i) => makeSkill(i));
  const stdout = JSON.stringify(skills);
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = callback as (err: null, stdout: string, stderr: string) => void;
    cb(null, stdout, "");
    return {} as ReturnType<typeof execFile>;
  });
  // Suppress the debug flood from 100/1000 skills
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
}

describe("Performance baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sync() with 100 skills completes in <200ms (subprocess mocked)", async () => {
    makeCliWithN(100);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    const start = performance.now();
    await registry.sync();
    const elapsed = performance.now() - start;
    expect(registry.getAll()).toHaveLength(100);
    expect(elapsed).toBeLessThan(200);
  });

  it("getSkill() with 1000 registered skills returns in <1ms", async () => {
    makeCliWithN(1000);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    // Warm up
    registry.getSkill("skill-500");
    const start = performance.now();
    registry.getSkill("skill-999");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  it("getAll() with 1000 registered skills completes in <5ms", async () => {
    makeCliWithN(1000);
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent-skills" });
    await registry.sync();
    const start = performance.now();
    const all = registry.getAll();
    const elapsed = performance.now() - start;
    expect(all).toHaveLength(1000);
    expect(elapsed).toBeLessThan(5);
  });
});
