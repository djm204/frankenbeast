import type { UnifiedRequest } from "../../types/index.js";
import type { GuardrailsConfig } from "../../config/index.js";
import type { InterceptorResult } from "../interceptor-result.js";
export type { SkillRegistryClient } from "../skill-registry-client.js";
import type { SkillRegistryClient } from "../skill-registry-client.js";
export declare function checkProjectAlignment(request: UnifiedRequest, config: GuardrailsConfig, skillRegistry?: SkillRegistryClient): InterceptorResult;
//# sourceMappingURL=project-alignment-checker.d.ts.map