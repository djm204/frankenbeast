import type { UnifiedResponse, ToolCall } from "../../types/index.js";
import type { InterceptorResult } from "../interceptor-result.js";
export type { SkillRegistryClient } from "../skill-registry-client.js";
import type { SkillRegistryClient } from "../skill-registry-client.js";
export declare function groundToolCalls(response: UnifiedResponse, skillRegistry?: SkillRegistryClient): InterceptorResult<UnifiedResponse>;
export declare function makeToolCallFromResponse(tc: ToolCall): ToolCall;
//# sourceMappingURL=deterministic-grounder.d.ts.map