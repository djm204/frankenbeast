import type { BeastLoopDeps } from './deps.js';
import type { BeastInput, BeastResult } from './types.js';
import type { OrchestratorConfig } from './config/orchestrator-config.js';
/**
 * The Beast Loop — main orchestrator that wires all 8 modules.
 *
 * Phases:
 * 1. Ingestion — sanitize input via Firewall + hydrate from Memory
 * 2. Planning — create + critique plan via Planner/Critique
 * 3. Execution — run tasks via Skills/Governor
 * 4. Closure — finalize traces, heartbeat pulse
 */
export declare class BeastLoop {
    private readonly deps;
    private readonly config;
    constructor(deps: BeastLoopDeps, config?: Partial<OrchestratorConfig>);
    run(input: BeastInput): Promise<BeastResult>;
}
//# sourceMappingURL=beast-loop.d.ts.map