import type { HeartbeatReport } from '../core/types.js';
import type { HeartbeatConfig } from '../core/config.js';
import type { IMemoryModule } from '../modules/memory.js';
import type { IObservabilityModule } from '../modules/observability.js';
import type { IPlannerModule } from '../modules/planner.js';
import type { ICritiqueModule } from '../modules/critique.js';
import type { IHitlGateway } from '../modules/hitl.js';
import type { ILlmClient } from '../reflection/types.js';
import type { GitStatusResult } from '../checker/deterministic-checker.js';
export interface PulseOrchestratorDeps {
    readonly memory: IMemoryModule;
    readonly observability: IObservabilityModule;
    readonly planner: IPlannerModule;
    readonly critique: ICritiqueModule;
    readonly hitl: IHitlGateway;
    readonly llm: ILlmClient;
    readonly gitStatusExecutor: () => Promise<GitStatusResult>;
    readonly clock: () => Date;
    readonly config: HeartbeatConfig;
    readonly readFile: (path: string) => Promise<string>;
    readonly writeFile: (path: string, content: string) => Promise<void>;
    readonly projectId: string;
}
export declare class PulseOrchestrator {
    private readonly deps;
    constructor(deps: PulseOrchestratorDeps);
    run(): Promise<HeartbeatReport>;
}
//# sourceMappingURL=pulse-orchestrator.d.ts.map