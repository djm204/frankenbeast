import { applyModifications } from './hitl/plan-modifier.js';
import { PlanExporter } from './hitl/plan-exporter.js';
import { buildCoTExecutor } from './cot/cot-gate.js';
import { RationaleRejectedError, MaxRecoveryAttemptsError, UnknownErrorEscalatedError, } from './core/errors.js';
import { createTaskId } from './core/types.js';
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
export class Planner {
    guardrails;
    graphBuilder;
    executor;
    hitlGate;
    strategy;
    recovery;
    selfCritique;
    planExporter = new PlanExporter();
    constructor(guardrails, graphBuilder, executor, hitlGate, strategy, recovery, selfCritique) {
        this.guardrails = guardrails;
        this.graphBuilder = graphBuilder;
        this.executor = executor;
        this.hitlGate = hitlGate;
        this.strategy = strategy;
        this.recovery = recovery;
        this.selfCritique = selfCritique;
    }
    async plan(rawInput) {
        // 1. Sanitize via MOD-01
        const intent = await this.guardrails.getSanitizedIntent(rawInput);
        // 2. Build task graph
        let graph = await this.graphBuilder.build(intent);
        // 3. HITL approval gate
        const markdown = this.planExporter.toMarkdown(graph);
        const approval = await this.hitlGate.requestApproval(markdown);
        if (approval.decision === 'aborted') {
            return { status: 'aborted', reason: approval.reason };
        }
        if (approval.decision === 'modified') {
            graph = applyModifications(graph, approval.changes);
        }
        // 4. Optionally wrap executor with CoT gate (MOD-07)
        const executor = this.selfCritique
            ? buildCoTExecutor(this.executor, this.selfCritique)
            : this.executor;
        // 5. Execute with self-correction loop (ADR-007)
        let currentGraph = graph;
        let attempt = 1;
        for (;;) {
            let result;
            try {
                result = await this.strategy.execute(currentGraph, { executor });
            }
            catch (err) {
                if (err instanceof RationaleRejectedError) {
                    return { status: 'rationale_rejected', taskId: createTaskId(err.taskId) };
                }
                throw err;
            }
            if (result.status === 'completed')
                return result;
            if (result.status !== 'failed')
                return result; // defensive: unexpected status
            // result.status === 'failed' — attempt recovery
            try {
                currentGraph = await this.recovery.recover(result.failedTaskId, result.error, currentGraph, attempt);
                attempt++;
            }
            catch (recoveryErr) {
                if (recoveryErr instanceof MaxRecoveryAttemptsError ||
                    recoveryErr instanceof UnknownErrorEscalatedError) {
                    return result;
                }
                throw recoveryErr;
            }
        }
    }
}
//# sourceMappingURL=planner.js.map