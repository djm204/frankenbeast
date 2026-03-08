import { describe, it, expectTypeOf } from "vitest";
import type { ISkillRegistry } from "./i-skill-registry.js";
import type { UnifiedSkillContract } from "../types/index.js";

describe("ISkillRegistry interface", () => {
  it("hasSkill accepts string and returns boolean", () => {
    expectTypeOf<ISkillRegistry["hasSkill"]>().toEqualTypeOf<(id: string) => boolean>();
  });

  it("getSkill accepts string and returns contract or undefined", () => {
    expectTypeOf<ISkillRegistry["getSkill"]>().toEqualTypeOf<
      (id: string) => UnifiedSkillContract | undefined
    >();
  });

  it("getAll returns UnifiedSkillContract[]", () => {
    expectTypeOf<ISkillRegistry["getAll"]>().toEqualTypeOf<() => UnifiedSkillContract[]>();
  });

  it("sync returns Promise<void>", () => {
    expectTypeOf<ISkillRegistry["sync"]>().toEqualTypeOf<() => Promise<void>>();
  });

  it("isSynced returns boolean", () => {
    expectTypeOf<ISkillRegistry["isSynced"]>().toEqualTypeOf<() => boolean>();
  });

  it("SkillRegistry class (via createRegistry) satisfies ISkillRegistry", async () => {
    // Import here so the type test is structural, not import-dependent
    const { createRegistry } = await import("./create-registry.js");
    const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent" });
    expectTypeOf(registry).toMatchTypeOf<ISkillRegistry>();
  });
});
