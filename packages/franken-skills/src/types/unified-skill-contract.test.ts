import { describe, it, expectTypeOf } from "vitest";
import type { UnifiedSkillContract } from "./unified-skill-contract.js";
import type { SandboxType } from "./sandbox-type.js";
import type { SkillSource } from "./skill-source.js";

describe("UnifiedSkillContract type", () => {
  it("accepts a fully valid contract shape", () => {
    const contract: UnifiedSkillContract = {
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

    expectTypeOf(contract).toMatchTypeOf<UnifiedSkillContract>();
  });

  it("skill_id is a string", () => {
    expectTypeOf<UnifiedSkillContract["skill_id"]>().toEqualTypeOf<string>();
  });

  it("metadata.source is SkillSource", () => {
    expectTypeOf<UnifiedSkillContract["metadata"]["source"]>().toEqualTypeOf<SkillSource>();
  });

  it("constraints.sandbox_type is SandboxType", () => {
    expectTypeOf<UnifiedSkillContract["constraints"]["sandbox_type"]>().toEqualTypeOf<SandboxType>();
  });

  it("constraints.is_destructive is boolean", () => {
    expectTypeOf<UnifiedSkillContract["constraints"]["is_destructive"]>().toEqualTypeOf<boolean>();
  });

  it("constraints.requires_hitl is boolean", () => {
    expectTypeOf<UnifiedSkillContract["constraints"]["requires_hitl"]>().toEqualTypeOf<boolean>();
  });

  it("SandboxType only allows DOCKER, WASM, LOCAL", () => {
    expectTypeOf<SandboxType>().toEqualTypeOf<"DOCKER" | "WASM" | "LOCAL">();
  });

  it("SkillSource only allows GLOBAL, LOCAL", () => {
    expectTypeOf<SkillSource>().toEqualTypeOf<"GLOBAL" | "LOCAL">();
  });
});
