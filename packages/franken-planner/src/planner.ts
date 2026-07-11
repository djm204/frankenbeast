import { applyModifications } from './hitl/plan-modifier.js';
import { PlanExporter } from './hitl/plan-exporter.js';
import { buildCoTExecutor } from './cot/cot-gate.js';
import {
  CyclicDependencyError,
  DuplicateTaskError,
  RationaleRejectedError,
  MaxRecoveryAttemptsError,
  RecursionDepthExceededError,
  TaskNotFoundError,
  UnknownErrorEscalatedError,
} from './core/errors.js';
import { createTaskId } from './core/types.js';
import type { PlanResult, TaskId, TaskResult } from './core/types.js';
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
    try {
      return await this.executePlan(rawInput);
    } catch (err) {
      if (err instanceof RationaleRejectedError) {
        return { status: 'rationale_rejected', taskId: createTaskId(err.taskId) };
      }
      if (Planner.isStrategyDomainError(err)) {
        return Planner.toStrategyDomainFailure(err);
      }
      throw err;
    }
  }

  private async executePlan(rawInput: string): Promise<PlanResult> {
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
    const recoveryAttemptsByTask = new Map<TaskId, number>();
    const completedTaskIds = new Set<TaskId>();
    const completedTaskResults = new Map<TaskId, TaskResult>();
    const recoveryContinuationGraphs: PlanGraph[] = [];

    for (;;) {
      let result: PlanResult;
      try {
        result = await this.strategy.execute(currentGraph, { executor, completedTaskIds });
      } catch (err) {
        if (err instanceof RationaleRejectedError) {
          return { status: 'rationale_rejected', taskId: createTaskId(err.taskId) };
        }
        if (Planner.isStrategyDomainError(err)) {
          return Planner.toStrategyDomainFailure(err);
        }
        throw err;
      }

      if (result.status === 'completed') {
        Planner.recordCompletedTasks(result.taskResults, completedTaskIds, completedTaskResults);
        const continuationGraph = recoveryContinuationGraphs.shift();
        if (continuationGraph) {
          currentGraph = continuationGraph;
          continue;
        }
        return { status: 'completed', taskResults: Array.from(completedTaskResults.values()) };
      }
      if (result.status !== 'failed') return result; // defensive: unexpected status

      Planner.recordCompletedTasks(result.taskResults, completedTaskIds, completedTaskResults);

      // result.status === 'failed' — attempt recovery
      const failedTaskLineage = Planner.getRecoveryLineageRoot(result.failedTaskId);
      const attempt = (recoveryAttemptsByTask.get(failedTaskLineage) ?? 0) + 1;
      try {
        const recoveryGraph = result.recoveryGraph ?? currentGraph;
        currentGraph = await this.recovery.recover(
          result.failedTaskId,
          result.error,
          recoveryGraph,
          attempt
        );
        recoveryContinuationGraphs.unshift(...(result.recoveryContinuationGraphs ?? []));
        recoveryAttemptsByTask.set(failedTaskLineage, attempt);
      } catch (recoveryErr) {
        if (
          recoveryErr instanceof MaxRecoveryAttemptsError ||
          recoveryErr instanceof UnknownErrorEscalatedError
        ) {
          return Planner.mergeCompletedIntoFailedResult(result, completedTaskResults);
        }
        throw recoveryErr;
      }
    }
  }

  private static readonly STRATEGY_DOMAIN_FAILURE_TASK_ID = createTaskId('planner-domain-error');

  private static isStrategyDomainError(err: unknown): err is Error {
    return (
      err instanceof CyclicDependencyError ||
      err instanceof DuplicateTaskError ||
      err instanceof RecursionDepthExceededError ||
      err instanceof TaskNotFoundError
    );
  }

  private static toStrategyDomainFailure(error: Error): PlanResult {
    const failedTaskId = Planner.STRATEGY_DOMAIN_FAILURE_TASK_ID;
    return {
      status: 'failed',
      taskResults: [{ status: 'failure', taskId: failedTaskId, error }],
      failedTaskId,
      error,
    };
  }

  /**
   * Collapse recovery-generated task IDs to their original lineage.
   *
   * Recovery tasks are named as:
   *   `fix-<failedTaskId>-attempt-<n>`
   * and can be generated repeatedly from prior recovery tasks. For attempt
   * accounting, we track only the root task to avoid unbounded retries.
   */
  private static getRecoveryLineageRoot(taskId: TaskId): TaskId {
    const recoveryPattern = /^fix-(.+)-attempt-\d+$/;

    let current = taskId;
    while (recoveryPattern.test(current)) {
      const match = current.match(recoveryPattern);
      if (!match?.[1]) break;
      current = createTaskId(match[1]);
    }

    return current;
  }

  private static recordCompletedTasks(
    taskResults: TaskResult[],
    completedTaskIds: Set<TaskId>,
    completedTaskResults: Map<TaskId, TaskResult>
  ): void {
    for (const taskResult of taskResults) {
      if (taskResult.status !== 'success') continue;
      completedTaskIds.add(taskResult.taskId);
      completedTaskResults.set(taskResult.taskId, taskResult);
    }
  }

  private static mergeCompletedIntoFailedResult(
    result: Extract<PlanResult, { status: 'failed' }>,
    completedTaskResults: Map<TaskId, TaskResult>
  ): Extract<PlanResult, { status: 'failed' }> {
    const taskResultsById = new Map<TaskId, TaskResult>(completedTaskResults);
    for (const taskResult of result.taskResults) {
      taskResultsById.set(taskResult.taskId, taskResult);
    }
    return { ...result, taskResults: Array.from(taskResultsById.values()) };
  }
}
