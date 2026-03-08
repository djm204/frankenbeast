#!/usr/bin/env node
import type { CliArgs } from './args.js';
import type { PulseOrchestratorDeps } from '../orchestrator/pulse-orchestrator.js';
import type { ILlmClient } from '../reflection/types.js';
import type { IMemoryModule } from '../modules/memory.js';
import type { IObservabilityModule } from '../modules/observability.js';
import type { IPlannerModule } from '../modules/planner.js';
import type { ICritiqueModule } from '../modules/critique.js';
import type { IHitlGateway } from '../modules/hitl.js';
import type { GitStatusResult } from '../checker/deterministic-checker.js';
export declare const stubMemory: IMemoryModule;
export declare const stubObservability: IObservabilityModule;
export declare const stubPlanner: IPlannerModule;
export declare const stubCritique: ICritiqueModule;
export declare const stubHitl: IHitlGateway;
export declare const stubLlm: ILlmClient;
export declare function getGitStatus(): Promise<GitStatusResult>;
export declare function buildOrchestratorDeps(cliArgs: CliArgs): PulseOrchestratorDeps;
export declare function main(argv: string[]): Promise<string>;
//# sourceMappingURL=run.d.ts.map