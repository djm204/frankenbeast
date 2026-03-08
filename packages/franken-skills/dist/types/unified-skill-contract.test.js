import { describe, it, expectTypeOf } from "vitest";
describe("UnifiedSkillContract type", () => {
    it("accepts a fully valid contract shape", () => {
        const contract = {
            skill_id: "deploy-to-vercel",
            metadata: {
                name: "Deploy to Vercel",
                description: "Deploys the current project to Vercel",
                source: "GLOBAL",
            },
            interface: {
                input_schema: { type: "object", properties: { projectId: { type: "string" } } },
                output_schema: { type: "object", properties: { url: { type: "string" } } },
            },
            constraints: {
                is_destructive: false,
                requires_hitl: true,
                sandbox_type: "DOCKER",
            },
        };
        expectTypeOf(contract).toMatchTypeOf();
    });
    it("skill_id is a string", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("metadata.source is SkillSource", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("constraints.sandbox_type is SandboxType", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("constraints.is_destructive is boolean", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("constraints.requires_hitl is boolean", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("SandboxType only allows DOCKER, WASM, LOCAL", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("SkillSource only allows GLOBAL, LOCAL", () => {
        expectTypeOf().toEqualTypeOf();
    });
});
//# sourceMappingURL=unified-skill-contract.test.js.map