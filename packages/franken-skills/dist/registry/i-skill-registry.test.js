import { describe, it, expectTypeOf } from "vitest";
describe("ISkillRegistry interface", () => {
    it("hasSkill accepts string and returns boolean", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("getSkill accepts string and returns contract or undefined", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("getAll returns UnifiedSkillContract[]", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("sync returns Promise<void>", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("isSynced returns boolean", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("SkillRegistry class (via createRegistry) satisfies ISkillRegistry", async () => {
        // Import here so the type test is structural, not import-dependent
        const { createRegistry } = await import("./create-registry.js");
        const registry = createRegistry({ localSkillsDir: "/tmp/nonexistent" });
        expectTypeOf(registry).toMatchTypeOf();
    });
});
//# sourceMappingURL=i-skill-registry.test.js.map