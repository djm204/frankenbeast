export class SkillGenScaffold {
    /**
     * Generates a conservative UnifiedSkillContract skeleton for a missing skill.
     * Logs a structured alert and returns the template — does not register the skill.
     *
     * Conservative defaults (ADR-0007): is_destructive: true, requires_hitl: true,
     * sandbox_type: DOCKER. Developer must consciously opt out, not accidentally
     * leave permissive flags in place.
     */
    generate(skillId) {
        const skeleton = {
            skill_id: skillId,
            metadata: {
                name: `TODO: name for ${skillId}`,
                description: `TODO: high-clarity description of what ${skillId} does`,
                source: "LOCAL",
            },
            interface: {
                input_schema: {
                    type: "object",
                    properties: {},
                    required: [],
                    description: "TODO: define input parameters",
                },
                output_schema: {
                    type: "object",
                    properties: {},
                    description: "TODO: define output shape",
                },
            },
            constraints: {
                is_destructive: true,
                requires_hitl: true,
                sandbox_type: "DOCKER",
            },
        };
        console.warn(`[SkillGenScaffold] Skill "${skillId}" not found in registry. Add it to /skills/${skillId}.json to enable this capability.`, { skill_id: skillId, template: skeleton });
        return skeleton;
    }
}
//# sourceMappingURL=skill-gen-scaffold.js.map