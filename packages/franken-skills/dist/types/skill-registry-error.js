export class SkillRegistryError extends Error {
    code;
    skill_id;
    constructor(code, message, skill_id) {
        super(message);
        this.name = "SkillRegistryError";
        this.code = code;
        if (skill_id !== undefined) {
            this.skill_id = skill_id;
        }
    }
}
//# sourceMappingURL=skill-registry-error.js.map