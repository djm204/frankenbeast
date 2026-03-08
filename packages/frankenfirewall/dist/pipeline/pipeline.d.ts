import type { UnifiedRequest, UnifiedResponse, GuardrailViolation } from "../types/index.js";
import type { GuardrailsConfig } from "../config/index.js";
import type { IAdapter } from "../adapters/index.js";
import type { SkillRegistryClient } from "../interceptors/outbound/deterministic-grounder.js";
export interface PipelineOptions {
    skillRegistry?: SkillRegistryClient;
}
export interface PipelineResult {
    response: UnifiedResponse;
    violations: GuardrailViolation[];
}
export declare function runPipeline(request: UnifiedRequest, adapter: IAdapter, config: GuardrailsConfig, options?: PipelineOptions): Promise<PipelineResult>;
//# sourceMappingURL=pipeline.d.ts.map