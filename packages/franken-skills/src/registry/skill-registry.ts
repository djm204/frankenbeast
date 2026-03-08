import type { UnifiedSkillContract } from "../types/index.js";
import { SkillRegistryError } from "../types/index.js";
import { validateSkillContract } from "../validator/index.js";

export class SkillRegistry {
  private readonly store = new Map<string, UnifiedSkillContract>();
  private synced = false;

  /** Marks the registry as ready for reads. Called by sync() after population. */
  protected markSynced(): void {
    this.synced = true;
  }

  /** Clears the store. Called by sync() before re-populating so stale skills don't persist. */
  protected clearStore(): void {
    this.store.clear();
    this.synced = false;
  }

  isSynced(): boolean {
    return this.synced;
  }

  private assertSynced(): void {
    if (!this.synced) {
      throw new SkillRegistryError(
        "REGISTRY_NOT_SYNCED",
        "Registry has not been synced. Await sync() before querying.",
      );
    }
  }

  /**
   * Registers a contract after validating it. If a skill with the same ID
   * already exists and the new one is LOCAL, it overrides the existing entry
   * (local-first precedence). Override is logged at info level.
   */
  register(contract: UnifiedSkillContract): void {
    const validation = validateSkillContract(contract);
    if (!validation.ok) {
      throw new SkillRegistryError(
        "INVALID_CONTRACT",
        `Cannot register skill "${contract.skill_id}": ${validation.errors.map((e) => e.message).join("; ")}`,
        contract.skill_id,
      );
    }

    const existing = this.store.get(contract.skill_id);
    if (existing) {
      if (contract.metadata.source === "LOCAL") {
        console.info(
          `[SkillRegistry] Local skill "${contract.skill_id}" overrides global entry.`,
          { skill_id: contract.skill_id, source: "LOCAL" },
        );
        this.store.set(contract.skill_id, contract);
      }
      // If not LOCAL, the existing entry wins — no silent override from another global
      return;
    }

    this.store.set(contract.skill_id, contract);
  }

  getSkill(id: string): UnifiedSkillContract | undefined {
    this.assertSynced();
    return this.store.get(id);
  }

  getAll(): UnifiedSkillContract[] {
    this.assertSynced();
    return Array.from(this.store.values());
  }

  hasSkill(id: string): boolean {
    this.assertSynced();
    return this.store.has(id);
  }

  /**
   * Pure merge of global and local skill arrays with local-first precedence.
   * Duplicates within the same source are logged as errors (first wins).
   * Returns both the resolved Map and a Set of skill_ids that are local overrides
   * of a global skill (used by sync() to annotate the inventory log).
   */
  static resolveSkills(
    globals: UnifiedSkillContract[],
    locals: UnifiedSkillContract[],
  ): { skills: Map<string, UnifiedSkillContract>; overrides: Set<string> } {
    const skills = new Map<string, UnifiedSkillContract>();
    const overrides = new Set<string>();

    for (const skill of globals) {
      if (skills.has(skill.skill_id)) {
        console.error(
          `[SkillRegistry] Duplicate skill_id "${skill.skill_id}" in global source: keeping first.`,
          { skill_id: skill.skill_id, source: "GLOBAL" },
        );
        continue;
      }
      skills.set(skill.skill_id, skill);
    }

    for (const skill of locals) {
      if (skills.has(skill.skill_id) && skills.get(skill.skill_id)?.metadata.source === "LOCAL") {
        console.error(
          `[SkillRegistry] Duplicate skill_id "${skill.skill_id}" in local source: keeping first.`,
          { skill_id: skill.skill_id, source: "LOCAL" },
        );
        continue;
      }
      if (skills.has(skill.skill_id)) {
        // Local is overriding a global — track it
        overrides.add(skill.skill_id);
      }
      skills.set(skill.skill_id, skill);
    }

    return { skills, overrides };
  }
}
