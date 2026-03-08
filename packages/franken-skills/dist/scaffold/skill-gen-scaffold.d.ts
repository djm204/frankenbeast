import type { UnifiedSkillContract } from "../types/index.js";
export declare class SkillGenScaffold {
    /**
     * Generates a conservative UnifiedSkillContract skeleton for a missing skill.
     * Logs a structured alert and returns the template — does not register the skill.
     *
     * Conservative defaults (ADR-0007): is_destructive: true, requires_hitl: true,
     * sandbox_type: DOCKER. Developer must consciously opt out, not accidentally
     * leave permissive flags in place.
     */
    generate(skillId: string): UnifiedSkillContract;
}
//# sourceMappingURL=skill-gen-scaffold.d.ts.map