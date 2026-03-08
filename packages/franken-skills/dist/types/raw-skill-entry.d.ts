/**
 * Unvalidated shape from `@djm204/agent-skills --list` stdout.
 * Fields are all unknown — the validator converts this to UnifiedSkillContract.
 */
export interface RawSkillEntry {
    skill_id: unknown;
    metadata?: {
        name?: unknown;
        description?: unknown;
        source?: unknown;
    };
    interface?: {
        input_schema?: unknown;
        output_schema?: unknown;
    };
    constraints?: {
        is_destructive?: unknown;
        requires_hitl?: unknown;
        sandbox_type?: unknown;
    };
}
//# sourceMappingURL=raw-skill-entry.d.ts.map