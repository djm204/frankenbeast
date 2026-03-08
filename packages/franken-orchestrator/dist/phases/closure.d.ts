import type { BeastContext } from '../context/franken-context.js';
import type { IObserverModule, IHeartbeatModule, ILogger } from '../deps.js';
import type { BeastResult, TaskOutcome } from '../types.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { PrCreator } from '../closure/pr-creator.js';
/**
 * Beast Loop Phase 4: Closure
 * Finalizes traces, computes token spend, runs optional heartbeat pulse,
 * and assembles the final BeastResult.
 */
export declare function runClosure(ctx: BeastContext, observer: IObserverModule, heartbeat: IHeartbeatModule, config: OrchestratorConfig, taskOutcomes: readonly TaskOutcome[], logger?: ILogger, prCreator?: PrCreator): Promise<BeastResult>;
//# sourceMappingURL=closure.d.ts.map