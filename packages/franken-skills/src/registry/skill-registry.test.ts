import { describe, it, expect, vi } from "vitest";
import { SkillRegistry } from "./skill-registry.js";
import { SkillRegistryError } from "../types/index.js";
import type { UnifiedSkillContract } from "../types/index.js";

function makeContract(overrides: Partial<UnifiedSkillContract> = {}): UnifiedSkillContract {
  return {
    skill_id: "test-skill",
    metadata: {
      name: "Test Skill",
      description: "A test skill",
      source: "GLOBAL",
    },
    interface: {
      input_schema: { type: "object" },
      output_schema: { type: "object" },
    },
    constraints: {
      is_destructive: false,
      requires_hitl: false,
      sandbox_type: "LOCAL",
    },
    ...overrides,
  };
}

describe("SkillRegistry — storage and retrieval", () => {
  it("registers a valid contract and retrieves it by skill_id", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    registry.register(makeContract());
    const result = registry.getSkill("test-skill");
    expect(result?.skill_id).toBe("test-skill");
  });

  it("getSkill returns undefined for unknown skill_id", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    expect(registry.getSkill("nonexistent")).toBeUndefined();
  });

  it("getAll returns all registered contracts", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    registry.register(makeContract({ skill_id: "skill-a" }));
    registry.register(makeContract({ skill_id: "skill-b" }));
    expect(registry.getAll()).toHaveLength(2);
  });

  it("hasSkill returns true for registered skill, false for unknown", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    registry.register(makeContract());
    expect(registry.hasSkill("test-skill")).toBe(true);
    expect(registry.hasSkill("ghost")).toBe(false);
  });

  it("getSkill before sync throws REGISTRY_NOT_SYNCED", () => {
    const registry = new SkillRegistry();
    expect(() => registry.getSkill("anything")).toThrow(SkillRegistryError);
    expect(() => registry.getSkill("anything")).toThrowError(
      expect.objectContaining({ code: "REGISTRY_NOT_SYNCED" }),
    );
  });

  it("getAll before sync throws REGISTRY_NOT_SYNCED", () => {
    const registry = new SkillRegistry();
    expect(() => registry.getAll()).toThrow(SkillRegistryError);
  });

  it("hasSkill before sync throws REGISTRY_NOT_SYNCED", () => {
    const registry = new SkillRegistry();
    expect(() => registry.hasSkill("anything")).toThrow(SkillRegistryError);
  });

  it("isSynced returns false before markSynced, true after", () => {
    const registry = new SkillRegistry();
    expect(registry.isSynced()).toBe(false);
    registry["markSynced"]();
    expect(registry.isSynced()).toBe(true);
  });
});

describe("SkillRegistry — local/global precedence", () => {
  it("local skill with same skill_id as global — local wins", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    const global = makeContract({ skill_id: "shared", metadata: { name: "G", description: "Global version", source: "GLOBAL" } });
    const local = makeContract({ skill_id: "shared", metadata: { name: "L", description: "Local version", source: "LOCAL" } });
    registry.register(global);
    registry.register(local);
    expect(registry.getSkill("shared")?.metadata.source).toBe("LOCAL");
    expect(registry.getSkill("shared")?.metadata.description).toBe("Local version");
  });

  it("local override is logged at info level with skill_id", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    registry.register(makeContract({ skill_id: "shared", metadata: { name: "G", description: "Global", source: "GLOBAL" } }));
    registry.register(makeContract({ skill_id: "shared", metadata: { name: "L", description: "Local", source: "LOCAL" } }));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("shared"),
      expect.anything(),
    );
    logSpy.mockRestore();
  });

  it("invalid local skill does not shadow valid global — global survives", () => {
    const registry = new SkillRegistry();
    registry["markSynced"]();
    const global = makeContract({ skill_id: "shared", metadata: { name: "G", description: "Global version", source: "GLOBAL" } });
    registry.register(global);
    // Attempt to register a contract that fails validation (empty description)
    const badLocal: UnifiedSkillContract = {
      ...makeContract({ skill_id: "shared" }),
      metadata: { name: "Bad", description: "", source: "LOCAL" },
    };
    expect(() => registry.register(badLocal)).toThrow(SkillRegistryError);
    // Global still registered
    expect(registry.getSkill("shared")?.metadata.source).toBe("GLOBAL");
  });
});

describe("SkillRegistry — resolveSkills", () => {
  it("resolveSkills merges global and local with local-first precedence", () => {
    const global1 = makeContract({ skill_id: "a", metadata: { name: "A", description: "Global A", source: "GLOBAL" } });
    const global2 = makeContract({ skill_id: "b", metadata: { name: "B", description: "Global B", source: "GLOBAL" } });
    const local1 = makeContract({ skill_id: "b", metadata: { name: "B-local", description: "Local B", source: "LOCAL" } });
    const { skills } = SkillRegistry.resolveSkills([global1, global2], [local1]);
    expect(skills.get("a")?.metadata.source).toBe("GLOBAL");
    expect(skills.get("b")?.metadata.source).toBe("LOCAL");
    expect(skills.size).toBe(2);
  });

  it("resolveSkills populates overrides set for local-over-global replacements", () => {
    const globalB = makeContract({ skill_id: "b", metadata: { name: "B", description: "Global B", source: "GLOBAL" } });
    const localB = makeContract({ skill_id: "b", metadata: { name: "B-local", description: "Local B", source: "LOCAL" } });
    const globalA = makeContract({ skill_id: "a", metadata: { name: "A", description: "Global A", source: "GLOBAL" } });
    const { overrides } = SkillRegistry.resolveSkills([globalA, globalB], [localB]);
    expect(overrides.has("b")).toBe(true);
    expect(overrides.has("a")).toBe(false);
  });

  it("two local skills with same skill_id — first wins, error logged", () => {
    const local1 = makeContract({ skill_id: "dup", metadata: { name: "First", description: "First local", source: "LOCAL" } });
    const local2 = makeContract({ skill_id: "dup", metadata: { name: "Second", description: "Second local", source: "LOCAL" } });
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { skills } = SkillRegistry.resolveSkills([], [local1, local2]);
    expect(skills.size).toBe(1);
    expect(skills.get("dup")?.metadata.description).toBe("First local");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("dup"), expect.anything());
    logSpy.mockRestore();
  });
});
