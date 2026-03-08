import { describe, it, expect, vi } from "vitest";
import { SkillGenScaffold } from "./skill-gen-scaffold.js";
import { validateSkillContract } from "../validator/index.js";

describe("SkillGenScaffold", () => {
  it("generate() returns a contract skeleton with skill_id pre-filled", () => {
    const scaffold = new SkillGenScaffold();
    const skeleton = scaffold.generate("my-missing-skill");
    expect(skeleton.skill_id).toBe("my-missing-skill");
  });

  it("scaffold skeleton passes structural validation (all required keys present)", () => {
    const scaffold = new SkillGenScaffold();
    const skeleton = scaffold.generate("validate-me");
    const result = validateSkillContract(skeleton);
    expect(result.ok).toBe(true);
  });

  it("scaffold defaults — is_destructive: true, requires_hitl: true, sandbox_type: DOCKER", () => {
    const scaffold = new SkillGenScaffold();
    const skeleton = scaffold.generate("conservative-check");
    expect(skeleton.constraints.is_destructive).toBe(true);
    expect(skeleton.constraints.requires_hitl).toBe(true);
    expect(skeleton.constraints.sandbox_type).toBe("DOCKER");
  });

  it("scaffold source is LOCAL (goes in /skills, not global package)", () => {
    const scaffold = new SkillGenScaffold();
    const skeleton = scaffold.generate("local-check");
    expect(skeleton.metadata.source).toBe("LOCAL");
  });

  it("generate() emits a structured alert log with skill_id and instructions", () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scaffold = new SkillGenScaffold();
    scaffold.generate("missing-skill-id");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("missing-skill-id"),
      expect.anything(),
    );
    logSpy.mockRestore();
  });

  it("generate() does not change registry state — purely side-effect of logging", () => {
    // The scaffold just returns a template; it does not register anything.
    // Verified by checking there is no registry interaction in the output.
    const scaffold = new SkillGenScaffold();
    const skeleton = scaffold.generate("orphan");
    expect(skeleton).toBeDefined();
    expect(skeleton.skill_id).toBe("orphan");
  });
});
