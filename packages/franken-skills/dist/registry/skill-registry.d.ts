import type { UnifiedSkillContract } from "../types/index.js";
export declare class SkillRegistry {
    private readonly store;
    private synced;
    /** Marks the registry as ready for reads. Called by sync() after population. */
    protected markSynced(): void;
    /** Clears the store. Called by sync() before re-populating so stale skills don't persist. */
    protected clearStore(): void;
    isSynced(): boolean;
    private assertSynced;
    /**
     * Registers a contract after validating it. If a skill with the same ID
     * already exists and the new one is LOCAL, it overrides the existing entry
     * (local-first precedence). Override is logged at info level.
     */
    register(contract: UnifiedSkillContract): void;
    getSkill(id: string): UnifiedSkillContract | undefined;
    getAll(): UnifiedSkillContract[];
    hasSkill(id: string): boolean;
    /**
     * Pure merge of global and local skill arrays with local-first precedence.
     * Duplicates within the same source are logged as errors (first wins).
     * Returns both the resolved Map and a Set of skill_ids that are local overrides
     * of a global skill (used by sync() to annotate the inventory log).
     */
    static resolveSkills(globals: UnifiedSkillContract[], locals: UnifiedSkillContract[]): {
        skills: Map<string, UnifiedSkillContract>;
        overrides: Set<string>;
    };
}
//# sourceMappingURL=skill-registry.d.ts.map