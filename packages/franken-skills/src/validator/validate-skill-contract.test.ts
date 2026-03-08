import { describe, it, expect } from "vitest";
import { validateSkillContract } from "./validate-skill-contract.js";
import { SkillRegistryError } from "../types/index.js";

const validContract = {
  skill_id: "deploy-to-vercel",
  metadata: {
    name: "Deploy to Vercel",
    description: "Deploys the current project to Vercel",
    source: "GLOBAL",
  },
  interface: {
    input_schema: { type: "object" },
    output_schema: { type: "object" },
  },
  constraints: {
    is_destructive: false,
    requires_hitl: true,
    sandbox_type: "DOCKER",
  },
};

describe("validateSkillContract", () => {
  it("PASS — fully valid contract returns the contract", () => {
    const result = validateSkillContract(validContract);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skill_id).toBe("deploy-to-vercel");
    }
  });

  it("FAIL — missing skill_id", () => {
    const bad = { ...validContract, skill_id: undefined };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "INVALID_CONTRACT" && /skill_id/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — empty string skill_id", () => {
    const bad = { ...validContract, skill_id: "" };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /skill_id/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — missing metadata.description", () => {
    const bad = {
      ...validContract,
      metadata: { ...validContract.metadata, description: undefined },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /description/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — missing interface.input_schema", () => {
    const bad = {
      ...validContract,
      interface: { output_schema: { type: "object" } },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /input_schema/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — missing interface.output_schema", () => {
    const bad = {
      ...validContract,
      interface: { input_schema: { type: "object" } },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /output_schema/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — is_destructive is not boolean (string 'true' rejected)", () => {
    const bad = {
      ...validContract,
      constraints: { ...validContract.constraints, is_destructive: "true" },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /is_destructive/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — requires_hitl is not boolean", () => {
    const bad = {
      ...validContract,
      constraints: { ...validContract.constraints, requires_hitl: 1 },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /requires_hitl/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — sandbox_type is not a valid SandboxType value", () => {
    const bad = {
      ...validContract,
      constraints: { ...validContract.constraints, sandbox_type: "KUBERNETES" },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /sandbox_type/.test(e.message))).toBe(true);
    }
  });

  it("FAIL — metadata.source is not a valid SkillSource value", () => {
    const bad = {
      ...validContract,
      metadata: { ...validContract.metadata, source: "REMOTE" },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /source/.test(e.message))).toBe(true);
    }
  });

  it("collects multiple errors in one pass", () => {
    const bad = {
      skill_id: "",
      metadata: { name: "x", description: "", source: "GLOBAL" },
      interface: {},
      constraints: { is_destructive: "yes", requires_hitl: false, sandbox_type: "LOCAL" },
    };
    const result = validateSkillContract(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.every((e) => e instanceof SkillRegistryError)).toBe(true);
    }
  });
});
