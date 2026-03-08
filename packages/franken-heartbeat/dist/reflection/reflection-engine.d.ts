import type { ReflectionResult } from '../core/types.js';
import type { IMemoryModule } from '../modules/memory.js';
import type { IObservabilityModule } from '../modules/observability.js';
import type { ILlmClient, Result } from './types.js';
export interface ReflectionEngineDeps {
    readonly llm: ILlmClient;
    readonly memory: IMemoryModule;
    readonly observability: IObservabilityModule;
    readonly maxReflectionTokens: number;
}
export declare class ReflectionEngine {
    private readonly deps;
    constructor(deps: ReflectionEngineDeps);
    reflect(projectId: string): Promise<Result<ReflectionResult>>;
}
//# sourceMappingURL=reflection-engine.d.ts.map