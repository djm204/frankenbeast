import type { PlanResult, TaskId } from './core/types.js';
import type { PlanGraph } from './core/dag.js';
import type { GuardrailsModule } from './modules/mod01.js';
import type { SelfCritiqueModule } from './modules/mod07.js';
import type { HITLGate } from './hitl/types.js';
import type { PlanningStrategy, TaskExecutor, GraphBuilder } from './planners/types.js';
/** Minimal recovery interface satisfied by RecoveryController (ADR-005). */
interface Recovery {
    recover(failedTaskId: TaskId, error: Error, graph: PlanGraph, attempt: number): Promise<PlanGraph>;
}
/**
 * Top-level Planner orchestrator (ADR-004, ADR-005).
 *
 * Execution flow:
 *   1. Sanitize rawInput → Intent via GuardrailsModule (MOD-01)
 *   2. Build PlanGraph from Intent via GraphBuilder
 *   3. Export to Markdown and gate on HITL approval
 *   4. Execute via injected PlanningStrategy (optionally wrapped with CoT gate)
 *   5. On failure: attempt self-correction via Recovery; abort after max attempts
 */
export declare class Planner {
    private readonly guardrails;
    private readonly graphBuilder;
    private readonly executor;
    private readonly hitlGate;
    private readonly strategy;
    private readonly recovery;
    private readonly selfCritique?;
    private readonly planExporter;
    constructor(guardrails: GuardrailsModule, graphBuilder: GraphBuilder, executor: TaskExecutor, hitlGate: HITLGate, strategy: PlanningStrategy, recovery: Recovery, selfCritique?: SelfCritiqueModule | undefined);
    plan(rawInput: string): Promise<PlanResult>;
}
export {};
//# sourceMappingURL=planner.d.ts.map