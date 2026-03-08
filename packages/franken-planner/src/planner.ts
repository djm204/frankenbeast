import { applyModifications } from './hitl/plan-modifier.js';
import { PlanExporter } from './hitl/plan-exporter.js';
import { buildCoTExecutor } from './cot/cot-gate.js';
import {
  RationaleRejectedError,
  MaxRecoveryAttemptsError,
  UnknownErrorEscalatedError,
} from './core/errors.js';
import { createTaskId } from './core/types.js';
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
export class Planner {
  private readonly planExporter = new PlanExporter();

  constructor(
    private readonly guardrails: GuardrailsModule,
    private readonly graphBuilder: GraphBuilder,
    private readonly executor: TaskExecutor,
    private readonly hitlGate: HITLGate,
    private readonly strategy: PlanningStrategy,
    private readonly recovery: Recovery,
    private readonly selfCritique?: SelfCritiqueModule
  ) {}

  async plan(rawInput: string): Promise<PlanResult> {
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
    const executor: TaskExecutor = this.selfCritique
      ? buildCoTExecutor(this.executor, this.selfCritique)
      : this.executor;

    // 5. Execute with self-correction loop (ADR-007)
    let currentGraph = graph;
    let attempt = 1;

    for (;;) {
      let result: PlanResult;
      try {
        result = await this.strategy.execute(currentGraph, { executor });
      } catch (err) {
        if (err instanceof RationaleRejectedError) {
          return { status: 'rationale_rejected', taskId: createTaskId(err.taskId) };
        }
        throw err;
      }

      if (result.status === 'completed') return result;
      if (result.status !== 'failed') return result; // defensive: unexpected status

      // result.status === 'failed' — attempt recovery
      try {
        currentGraph = await this.recovery.recover(
          result.failedTaskId,
          result.error,
          currentGraph,
          attempt
        );
        attempt++;
      } catch (recoveryErr) {
        if (
          recoveryErr instanceof MaxRecoveryAttemptsError ||
          recoveryErr instanceof UnknownErrorEscalatedError
        ) {
          return result;
        }
        throw recoveryErr;
      }
    }
  }
}
