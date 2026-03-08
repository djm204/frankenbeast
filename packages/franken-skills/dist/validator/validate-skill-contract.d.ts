import type { UnifiedSkillContract } from "../types/unified-skill-contract.js";
import { SkillRegistryError } from "../types/skill-registry-error.js";
type ValidationResult = {
    ok: true;
    value: UnifiedSkillContract;
} | {
    ok: false;
    errors: SkillRegistryError[];
};
export declare function validateSkillContract(raw: unknown): ValidationResult;
export {};
//# sourceMappingURL=validate-skill-contract.d.ts.map