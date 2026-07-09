import type { BeastContext } from '../context/franken-context.js';
import type {
  ISkillsModule,
  IGovernorModule,
  IMemoryModule,
  IObserverModule,
  PlanTask,
  SkillInput,
  IMcpModule,
  McpToolInfo,
  MemoryContext,
  ILogger,
  ICheckpointStore,
  SkillDescriptor,
} from '../deps.js';
import type { TaskOutcome } from '../types.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { NullLogger } from '../logger.js';
import {
  RecoveryController,
  PlanGraph as RecoveryPlanGraph,
  createTaskId,
  UnknownErrorEscalatedError,
  MaxRecoveryAttemptsError,
  type KnownError,
  type MemoryModule as RecoveryMemoryModule,
  type Task as RecoveryTask,
} from '@franken/planner';

export const NON_INTERACTIVE_HITL_REMEDY = 'HITL approval was rejected by the non-interactive fail-closed default. To explicitly allow required HITL gates in trusted CI/headless runs, set FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1; otherwise rerun in an interactive TTY and approve the prompt.';

export class HitlRejectedError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly reason: string,
  ) {
    super(`Task ${taskId} rejected by governor: ${reason}`);
    this.name = 'HitlRejectedError';
  }
}

type PendingTaskEntry = [string, PlanTask];

type WaveExecutionResult = {
  readonly taskId: string;
  readonly task: PlanTask;
  readonly outcome: TaskOutcome;
};

function selectExecutableWave(
  pendingEntries: readonly PendingTaskEntry[],
  completed: ReadonlySet<string>,
  skills: ISkillsModule,
): PendingTaskEntry[] {
  const readyEntries = pendingEntries.filter(([, task]) =>
    task.dependsOn.every(dep => completed.has(dep)),
  );

  const firstReadyEntry = readyEntries[0];
  if (!firstReadyEntry) {
    return [];
  }

  if (taskRequiresSerializedExecution(firstReadyEntry[1], skills)) {
    return [firstReadyEntry];
  }

  return readyEntries.filter(([, task]) =>
    !taskRequiresSerializedExecution(task, skills),
  );
}

function taskRequiresSerializedExecution(task: PlanTask, skills: ISkillsModule): boolean {
  if (task.requiredSkills.length === 0) {
    return false;
  }

  let availableSkills: readonly SkillDescriptor[];
  try {
    availableSkills = skills.getAvailableSkills();
  } catch {
    return false;
  }

  return task.requiredSkills.some(skillId => {
    const descriptor = availableSkills.find(skill => skill.id === skillId);
    return skillRequiresSerializedExecution(skillId, descriptor);
  });
}

function skillRequiresSerializedExecution(
  skillId: string,
  descriptor: SkillDescriptor | undefined,
): boolean {
  return descriptor?.requiresHitl === true
    || descriptor?.executionType === 'cli'
    || (!descriptor && skillId.startsWith('cli:'));
}

function describeApprovalRejection(reason: string | undefined): string {
  if (reason === 'defaultDecision') {
    return NON_INTERACTIVE_HITL_REMEDY;
  }

  return reason ?? 'Rejected';
}

/**
 * Beast Loop Phase 3: Validated Execution
 * Executes tasks from the plan in topological order.
 * For each task: check HITL → governor approval → execute → record trace → emit span.
 */
export async function runExecution(
  ctx: BeastContext,
  skills: ISkillsModule,
  governor: IGovernorModule,
  memory: IMemoryModule,
  observer: IObserverModule,
  mcp?: IMcpModule,
  logger: ILogger = new NullLogger(),
  cliExecutor?: CliSkillExecutor,
  checkpoint?: ICheckpointStore,
  refreshPlanTasks?: () => Promise<readonly PlanTask[]>,
  config?: Pick<OrchestratorConfig, 'enableTracing'>,
): Promise<readonly TaskOutcome[]> {
  ctx.phase = 'execution';
  ctx.checkpointPath = checkpoint?.checkpointPath;
  ctx.addAudit('orchestrator', 'phase:start', { phase: 'execution' });
  logger.info('Execution: start', { phase: 'execution' });

  if (!ctx.plan) {
    throw new Error('Cannot execute without a plan — planning phase incomplete');
  }

  const outcomes: TaskOutcome[] = [];
  const completed = new Set<string>();
  const completedOutputs = new Map<string, unknown>();
  ctx.plan = { tasks: mergeCheckpointRecoveryTasks(ctx.plan.tasks, checkpoint) };
  validateAcyclicPlan(ctx.plan.tasks);
  const knownTaskIds = new Set(ctx.plan.tasks.map((t) => t.id));

  // Simple topological execution: keep a keyed FIFO queue so plan refreshes can
  // atomically add newly discovered tasks without duplicating overlapping work.
  const pending = new Map(ctx.plan.tasks.map((task) => [task.id, task]));
  const recoveryAttempts = seedRecoveryAttempts(ctx.plan.tasks);
  const terminalSkipped = new Set<string>();
  const terminalFailures = new Set<string>();
  let iterations = 0;
  let maxIterations = Math.max(pending.size * 2, 10); // safety guard

  while (pending.size > 0 && iterations < maxIterations) {
    iterations++;
    if (refreshPlanTasks) {
      const latestTasks = await refreshPlanTasks();
      const refreshedTasks = collectNewRefreshTasks(latestTasks, knownTaskIds);

      if (refreshedTasks.length > 0) {
        const refreshedPlan: PlanTask[] = [...ctx.plan.tasks, ...refreshedTasks];
        validateAcyclicPlan(refreshedPlan);

        for (const task of refreshedTasks) {
          knownTaskIds.add(task.id);
          pending.set(task.id, task);
        }

        maxIterations += refreshedTasks.length * 2;
        ctx.plan = { tasks: refreshedPlan };
        logger.info('Execution: plan refreshed', {
          addedTasks: refreshedTasks.length,
          totalTasks: knownTaskIds.size,
        });
      }
    }

    const readyEntries = selectExecutableWave([...pending], completed, skills);

    if (readyEntries.length === 0) {
      // All remaining tasks have unmet dependencies — deadlock
      ctx.circuitBreakerTripped = true;
      for (const task of pending.values()) {
        outcomes.push({
          taskId: task.id,
          status: 'skipped',
          error: 'Unmet dependencies',
        });
        terminalSkipped.add(task.id);
      }
      break;
    }

    for (const [taskId] of readyEntries) {
      pending.delete(taskId);
    }

    logger.info('Execution: parallel wave start', {
      size: readyEntries.length,
      taskIds: readyEntries.map(([taskId]) => taskId),
    });

    const settledWaveResults = await Promise.allSettled(readyEntries.map(async ([taskId, task]) => {
      // Skip tasks already completed in a previous run (checkpoint recovery)
      if (checkpoint?.has(`${task.id}:done`)) {
        const checkpointedOutput = checkpoint.readTaskOutput?.(task.id);
        logger.info('Execution: Skipping checkpointed task', { taskId: task.id });
        const outcome = { taskId: task.id, status: 'success' as const, output: checkpointedOutput?.output };
        if (checkpointedOutput?.found) {
          completedOutputs.set(task.id, checkpointedOutput.output);
        }
        completed.add(task.id);
        return { taskId, task, outcome };
      }

      const outcome = await executeTask(
        task,
        skills,
        governor,
        memory,
        observer,
        ctx,
        completedOutputs,
        mcp,
        logger,
        cliExecutor,
        checkpoint,
        config,
      );

      if (outcome.status === 'success') {
        // Persist the task output before the done marker so a crash after marking
        // done can still rehydrate dependency outputs for downstream tasks.
        checkpoint?.writeTaskOutput?.(task.id, outcome.output);
        // Persist the checkpoint before mutating in-memory state so a crash here
        // is recovered as "done" on restart instead of silently re-running the task.
        checkpoint?.write(`${task.id}:done`);
        completed.add(task.id);
        completedOutputs.set(task.id, outcome.output);
      } else if (outcome.status === 'skipped') {
        terminalSkipped.add(task.id);
      }

      return { taskId, task, outcome };
    }));

    const rejectedWaveResult = settledWaveResults.find(result => result.status === 'rejected');
    if (rejectedWaveResult?.status === 'rejected') {
      throw rejectedWaveResult.reason;
    }

    const waveResults: WaveExecutionResult[] = settledWaveResults.map(result => {
      if (result.status === 'rejected') {
        throw result.reason;
      }
      return result.value;
    });

    logger.info('Execution: parallel wave done', {
      size: waveResults.length,
      taskIds: waveResults.map(result => result.taskId),
    });

    const waveFailureIds = new Set(
      waveResults
        .filter(result => result.outcome.status === 'failure')
        .map(result => result.task.id),
    );

    for (const { task, outcome } of waveResults) {
      if (outcome.status === 'success' || outcome.status === 'skipped') {
        outcomes.push(outcome);
      } else if (outcome.status === 'failure') {
        const recovered = await recoverFailedTask({
          ctx,
          governor,
          memory,
          task,
          error: new Error(outcome.error ?? 'Task failed'),
          pending,
          completed,
          knownTaskIds,
          terminalSkipped,
          terminalFailures,
          replacePendingTaskIds: waveFailureIds,
          recoveryAttempts,
          checkpoint,
          logger,
        });

        if (recovered) {
          maxIterations += 2;
        } else {
          await recordFailureTrace(memory, task, outcome.error ?? 'Task failed');
          outcomes.push(outcome);
          pending.delete(task.id);
          terminalFailures.add(task.id);
          ctx.circuitBreakerTripped = true;
        }
      }
    }
  }

  ctx.addAudit('orchestrator', 'execution:done', {
    total: outcomes.length,
    succeeded: outcomes.filter(o => o.status === 'success').length,
    failed: outcomes.filter(o => o.status === 'failure').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
  });
  logger.info('Execution: done', {
    total: outcomes.length,
    succeeded: outcomes.filter(o => o.status === 'success').length,
    failed: outcomes.filter(o => o.status === 'failure').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
  });

  return outcomes;
}

interface RecoveryAttemptInput {
  readonly ctx: BeastContext;
  readonly governor: IGovernorModule;
  readonly memory: IMemoryModule;
  readonly task: PlanTask;
  readonly error: Error;
  readonly pending: Map<string, PlanTask>;
  readonly completed: ReadonlySet<string>;
  readonly knownTaskIds: Set<string>;
  readonly terminalSkipped: ReadonlySet<string>;
  readonly terminalFailures: ReadonlySet<string>;
  readonly replacePendingTaskIds?: ReadonlySet<string> | undefined;
  readonly recoveryAttempts: Map<string, number>;
  readonly checkpoint?: ICheckpointStore | undefined;
  readonly logger: ILogger;
}

async function recoverFailedTask(input: RecoveryAttemptInput): Promise<boolean> {
  const {
    ctx,
    governor,
    memory,
    task,
    error,
    pending,
    completed,
    knownTaskIds,
    terminalSkipped,
    terminalFailures,
    replacePendingTaskIds,
    recoveryAttempts,
    checkpoint,
    logger,
  } = input;
  if (!ctx.plan) return false;

  if (isRecoveryFixTaskId(task.id)) {
    ctx.addAudit('orchestrator', 'recovery:failed', {
      failedTaskId: task.id,
      error: error.message,
      terminal: true,
      reason: 'recovery-task-failed',
    });
    logger.warn('Execution: generated recovery task failed terminally', {
      failedTaskId: task.id,
      error: error.message,
    });
    return false;
  }

  const recoveryTaskId = rootRecoveryTaskId(task.id);
  const attempt = (recoveryAttempts.get(recoveryTaskId) ?? 0) + 1;
  recoveryAttempts.set(recoveryTaskId, attempt);

  try {
    const recoveryController = new RecoveryController(createRecoveryMemoryAdapter(memory, ctx.projectId));
    const recoveredGraph = await recoveryController.recover(
      createTaskId(recoveryTaskId),
      error,
      toRecoveryGraph(ctx.plan.tasks),
      attempt,
    );
    const previousTasks = ctx.plan.tasks;
    const recoveredTasks = fromRecoveryGraph(recoveredGraph, task);
    validateAcyclicPlan(recoveredTasks);

    ctx.plan = { tasks: recoveredTasks };
    persistRecoveryTasks(checkpoint, previousTasks, recoveredTasks, task.id);

    for (const recoveredTask of recoveredTasks) {
      knownTaskIds.add(recoveredTask.id);
      const shouldReplacePending = replacePendingTaskIds?.has(recoveredTask.id) === true;
      if (
        !completed.has(recoveredTask.id) &&
        !terminalSkipped.has(recoveredTask.id) &&
        !terminalFailures.has(recoveredTask.id) &&
        (!pending.has(recoveredTask.id) || shouldReplacePending)
      ) {
        pending.set(recoveredTask.id, recoveredTask);
      }
    }

    if (terminalSkipped.size === 0 && terminalFailures.size === 0) {
      ctx.circuitBreakerTripped = false;
    }
    ctx.addAudit('orchestrator', 'recovery:injected', {
      failedTaskId: task.id,
      recoveryTaskId,
      attempt,
      tasks: recoveredTasks.length,
    });
    logger.warn('Execution: recovery injected fix-it task', {
      failedTaskId: task.id,
      recoveryTaskId,
      attempt,
      tasks: recoveredTasks.length,
    });
    return true;
  } catch (recoveryError) {
    const recoveryErrorObject = recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError));
    const knownTerminal =
      recoveryErrorObject instanceof UnknownErrorEscalatedError ||
      recoveryErrorObject instanceof MaxRecoveryAttemptsError;
    if (recoveryErrorObject instanceof UnknownErrorEscalatedError) {
      try {
        const approval = await governor.requestApproval({
          taskId: task.id,
          summary: `Unknown execution error requires operator decision: ${error.message}`,
          requiresHitl: true,
        });
        ctx.governorApproval = approval.decision === 'approved';
        ctx.addAudit('governor', 'recovery:unknown-error-escalated', {
          taskId: task.id,
          decision: approval.decision,
          reason: approval.reason,
        });
        logger.warn('Execution: unknown recovery error escalated to governor', {
          taskId: task.id,
          decision: approval.decision,
          reason: approval.reason,
        });
      } catch (approvalError) {
        const approvalErrorObject = approvalError instanceof Error ? approvalError : new Error(String(approvalError));
        ctx.addAudit('governor', 'recovery:unknown-error-escalation-failed', {
          taskId: task.id,
          error: approvalErrorObject.message,
        });
        logger.warn('Execution: unknown recovery error escalation failed', {
          taskId: task.id,
          error: approvalErrorObject.message,
        });
      }
    }
    ctx.addAudit('orchestrator', 'recovery:failed', {
      failedTaskId: task.id,
      recoveryTaskId,
      attempt,
      error: recoveryErrorObject.message,
      terminal: knownTerminal,
    });
    logger.warn('Execution: recovery unavailable', {
      failedTaskId: task.id,
      recoveryTaskId,
      attempt,
      error: recoveryErrorObject.message,
    });
    return false;
  }
}

function createRecoveryMemoryAdapter(memory: IMemoryModule, projectId: string): RecoveryMemoryModule {
  return {
    async getADRs() {
      const context = await memory.getContext(projectId);
      return context.adrs.map((adr) => ({ id: adr, title: adr, status: 'accepted' as const, decision: adr }));
    },
    async getKnownErrors() {
      const context = await memory.getContext(projectId);
      return context.knownErrors.map(toKnownError);
    },
    async getProjectContext() {
      const context = await memory.getContext(projectId);
      return { projectName: projectId, adrs: [], rules: [...context.rules] };
    },
  };
}

function toKnownError(entry: string): KnownError {
  const parsed = parseKnownError(entry);
  return {
    pattern: parsed.pattern,
    description: parsed.description,
    fixSuggestion: parsed.fixSuggestion,
  };
}

function parseKnownError(entry: string): KnownError {
  const trimmed = entry.trim();
  const json = tryParseKnownErrorJson(trimmed);
  if (json) return json;

  const arrowMatch = trimmed.match(/^(.*?)\s*(?:=>|->)\s*(.*?)$/u);
  if (arrowMatch) {
    const pattern = stripTracePrefix(arrowMatch[1]!.trim());
    return {
      pattern,
      description: pattern,
      fixSuggestion: arrowMatch[2]!.trim(),
    };
  }

  const pattern = stripTracePrefix(trimmed);

  return {
    pattern,
    description: pattern,
    fixSuggestion: `Fix known error before retrying the failed task: ${pattern}`,
  };
}

function stripTracePrefix(entry: string): string {
  return entry.replace(/^\[[^\]]+\]\s*/u, '').trim();
}

function tryParseKnownErrorJson(entry: string): KnownError | undefined {
  try {
    const parsed = JSON.parse(entry) as Partial<KnownError>;
    if (
      typeof parsed.pattern === 'string' &&
      typeof parsed.description === 'string' &&
      typeof parsed.fixSuggestion === 'string'
    ) {
      return parsed as KnownError;
    }
  } catch {
    // Plain-text known error entries are the common memory context shape.
  }
  return undefined;
}

function toRecoveryGraph(tasks: readonly PlanTask[]): RecoveryPlanGraph {
  const nodes = new Map<ReturnType<typeof createTaskId>, RecoveryTask>();
  const edges = new Map<ReturnType<typeof createTaskId>, Set<ReturnType<typeof createTaskId>>>();
  const taskIds = new Set(tasks.map(task => task.id));

  for (const task of tasks) {
    const recoveryTask = toRecoveryTask(task, taskIds);
    nodes.set(recoveryTask.id, recoveryTask);
    edges.set(recoveryTask.id, new Set(recoveryTask.dependsOn));
  }

  return RecoveryPlanGraph.createWithRawEdges(nodes, edges);
}

function toRecoveryTask(task: PlanTask, taskIds: ReadonlySet<string>): RecoveryTask {
  const existingDependencies = task.dependsOn.filter(dep => taskIds.has(dep));

  return {
    id: createTaskId(task.id),
    objective: task.objective,
    requiredSkills: [...task.requiredSkills],
    dependsOn: existingDependencies.map(dep => createTaskId(dep)),
    status: 'pending',
  };
}

function fromRecoveryGraph(graph: RecoveryPlanGraph, failedTask: PlanTask): PlanTask[] {
  const fixTaskPrefix = `fix-${failedTask.id}-attempt-`;

  return graph.topoSort().map((task: RecoveryTask) => {
    const dependencies = graph.getDependencies(task.id);
    return {
      id: task.id,
      objective: task.objective,
      requiredSkills: task.id.startsWith(fixTaskPrefix) && task.requiredSkills.length === 0
        ? [...failedTask.requiredSkills]
        : [...task.requiredSkills],
      dependsOn: task.id === failedTask.id
        ? mergeDependencies(dependencies, failedTask.dependsOn)
        : dependencies,
    };
  });
}

function mergeDependencies(primary: readonly string[], secondary: readonly string[]): string[] {
  return [...new Set([...primary, ...secondary])];
}

const RECOVERY_TASK_CHECKPOINT_PREFIX = 'recovery-task:';
const RECOVERY_TASK_CHECKPOINT_MARKER_PREFIX = 'recovery-task-v2:';
const RECOVERY_TASK_OUTPUT_PREFIX = 'recovery-task-output:';

function isRecoveryFixTaskId(taskId: string): boolean {
  return /^fix-.+-attempt-\d+$/u.test(taskId);
}

function rootRecoveryTaskId(taskId: string): string {
  let current = taskId;
  while (true) {
    const match = current.match(/^fix-(.+)-attempt-\d+$/u);
    if (!match) return current;
    current = match[1]!;
  }
}

function persistRecoveryTasks(
  checkpoint: ICheckpointStore | undefined,
  previousTasks: readonly PlanTask[],
  tasks: readonly PlanTask[],
  failedTaskId: string,
): void {
  if (!checkpoint) return;
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (!isRecoveryFixTaskId(task.id) && task.id !== failedTaskId) continue;
    const previousTask = previousById.get(task.id);
    if (!isRecoveryFixTaskId(task.id) && planTasksEqual(task, previousTask)) continue;
    persistRecoveryTask(checkpoint, task);
  }
}

function persistRecoveryTask(checkpoint: ICheckpointStore, task: PlanTask): void {
  if (checkpoint.writeTaskOutput) {
    const outputKey = recoveryTaskOutputKey(task.id);
    checkpoint.writeTaskOutput(outputKey, task);
    checkpoint.write(`${RECOVERY_TASK_CHECKPOINT_MARKER_PREFIX}${encodeRecoveryTaskId(task.id)}`);
    return;
  }

  const legacyEntry = `${RECOVERY_TASK_CHECKPOINT_PREFIX}${encodeRecoveryTask(task)}`;
  checkpoint.write(legacyEntry);
}

function mergeCheckpointRecoveryTasks(tasks: readonly PlanTask[], checkpoint: ICheckpointStore | undefined): PlanTask[] {
  if (!checkpoint) return [...tasks];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const entry of checkpoint.readAll()) {
    const recoveredTask = decodeCheckpointRecoveryTask(entry, checkpoint);
    if (recoveredTask) {
      byId.set(recoveredTask.id, recoveredTask);
    }
  }
  return [...byId.values()];
}

function decodeCheckpointRecoveryTask(entry: string, checkpoint: ICheckpointStore): PlanTask | undefined {
  if (entry.startsWith(RECOVERY_TASK_CHECKPOINT_MARKER_PREFIX)) {
    const taskId = decodeRecoveryTaskId(entry.slice(RECOVERY_TASK_CHECKPOINT_MARKER_PREFIX.length));
    if (!taskId || !checkpoint.readTaskOutput) return undefined;
    const output = checkpoint.readTaskOutput(recoveryTaskOutputKey(taskId));
    return output.found ? parsePlanTask(output.output) : undefined;
  }

  if (entry.startsWith(RECOVERY_TASK_CHECKPOINT_PREFIX)) {
    return decodeRecoveryTask(entry.slice(RECOVERY_TASK_CHECKPOINT_PREFIX.length));
  }

  return undefined;
}

function encodeRecoveryTask(task: PlanTask): string {
  return Buffer.from(JSON.stringify(task), 'utf8').toString('base64url');
}

function encodeRecoveryTaskId(taskId: string): string {
  return Buffer.from(taskId, 'utf8').toString('base64url');
}

function decodeRecoveryTaskId(payload: string): string | undefined {
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}

function recoveryTaskOutputKey(taskId: string): string {
  return `${RECOVERY_TASK_OUTPUT_PREFIX}${taskId}`;
}

function planTasksEqual(left: PlanTask, right: PlanTask | undefined): boolean {
  return !!right &&
    left.id === right.id &&
    left.objective === right.objective &&
    sameStringArray(left.requiredSkills, right.requiredSkills) &&
    sameStringArray(left.dependsOn, right.dependsOn);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function decodeRecoveryTask(payload: string): PlanTask | undefined {
  try {
    return parsePlanTask(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    // Ignore corrupt checkpoint recovery entries; the base plan still executes.
  }
  return undefined;
}

function parsePlanTask(value: unknown): PlanTask | undefined {
  const parsed = value as Partial<PlanTask>;
  if (
    typeof parsed.id === 'string' &&
    typeof parsed.objective === 'string' &&
    Array.isArray(parsed.requiredSkills) &&
    parsed.requiredSkills.every((skill): skill is string => typeof skill === 'string') &&
    Array.isArray(parsed.dependsOn) &&
    parsed.dependsOn.every((dep): dep is string => typeof dep === 'string')
  ) {
    return {
      id: parsed.id,
      objective: parsed.objective,
      requiredSkills: parsed.requiredSkills,
      dependsOn: parsed.dependsOn,
    };
  }
  return undefined;
}

function seedRecoveryAttempts(tasks: readonly PlanTask[]): Map<string, number> {
  const attempts = new Map<string, number>();

  for (const task of tasks) {
    const match = task.id.match(/^fix-(.+)-attempt-(\d+)$/u);
    if (!match) continue;

    const failedTaskId = rootRecoveryTaskId(match[1]!);
    const attempt = Number(match[2]);
    if (!Number.isSafeInteger(attempt) || attempt < 1) continue;

    attempts.set(failedTaskId, Math.max(attempts.get(failedTaskId) ?? 0, attempt));
  }

  return attempts;
}

async function recordFailureTrace(memory: IMemoryModule, task: PlanTask, summary: string): Promise<void> {
  await memory.recordTrace({
    taskId: task.id,
    summary,
    outcome: 'failure',
    timestamp: new Date().toISOString(),
  });
}

function collectNewRefreshTasks(
  latestTasks: readonly PlanTask[],
  knownTaskIds: ReadonlySet<string>,
): PlanTask[] {
  const seen = new Set(knownTaskIds);
  const newTasks: PlanTask[] = [];

  for (const task of latestTasks) {
    if (seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    newTasks.push(task);
  }

  return newTasks;
}

function validateAcyclicPlan(tasks: readonly PlanTask[]): void {
  const taskById = new Map<string, PlanTask>();
  for (const task of tasks) {
    if (taskById.has(task.id)) {
      throw new Error(`Refreshed plan contains duplicate task id '${task.id}'`);
    }
    taskById.set(task.id, task);
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const path: string[] = [];

  const visit = (task: PlanTask): void => {
    const currentState = state.get(task.id);
    if (currentState === 'visited') {
      return;
    }
    if (currentState === 'visiting') {
      const cycleStart = path.indexOf(task.id);
      const cycle = [...path.slice(cycleStart), task.id].join(' -> ');
      throw new Error(`Refreshed plan cycle detected: ${cycle}`);
    }

    state.set(task.id, 'visiting');
    path.push(task.id);
    for (const dep of task.dependsOn) {
      const dependency = taskById.get(dep);
      if (dependency) {
        visit(dependency);
      }
    }
    path.pop();
    state.set(task.id, 'visited');
  };

  for (const task of tasks) {
    visit(task);
  }
}

async function executeTask(
  task: PlanTask,
  skills: ISkillsModule,
  governor: IGovernorModule,
  memory: IMemoryModule,
  observer: IObserverModule,
  ctx: BeastContext,
  completedOutputs: ReadonlyMap<string, unknown>,
  mcp?: IMcpModule,
  logger: ILogger = new NullLogger(),
  cliExecutor?: CliSkillExecutor,
  checkpoint?: ICheckpointStore,
  config?: Pick<OrchestratorConfig, 'enableTracing'>,
): Promise<TaskOutcome> {
  ctx.retryCount = (ctx.retryCount ?? 0) + 1;
  const startTime = Date.now();
  const span = config?.enableTracing ? observer.startSpan(`task:${task.id}`) : undefined;
  logger.info('Execution: task start', {
    taskId: task.id,
    skillIds: task.requiredSkills,
    dependsOn: task.dependsOn,
  });
  logger.debug('Execution: task detail', { task });

  try {
    // Dirty file resume: recover partial work from a crashed run.
    // Keep this inside try/catch so recovery failures are captured as task failures.
    const dirtyRecoveryStage = task.id.startsWith('harden:') || task.id.startsWith('fix-harden:') ? 'harden' : 'impl';
    if (checkpoint && cliExecutor && checkpoint.lastCommit(task.id, dirtyRecoveryStage)) {
      await cliExecutor.recoverDirtyFiles(task.id, dirtyRecoveryStage, checkpoint, logger);
    }

    // Check HITL requirement
    const requiresHitl = task.requiredSkills.some(s => {
      const available = skills.getAvailableSkills();
      const skill = available.find(sk => sk.id === s);
      return skill?.requiresHitl ?? false;
    });

    if (requiresHitl) {
      const approval = await governor.requestApproval({
        taskId: task.id,
        summary: task.objective,
        requiresHitl: true,
      });
      logger.info('Execution: governor decision', {
        taskId: task.id,
        decision: approval.decision,
        reason: approval.reason,
      });
      ctx.governorApproval = approval.decision === 'approved';

      if (approval.decision === 'rejected' || approval.decision === 'abort') {
        const reason = describeApprovalRejection(approval.reason);
        ctx.circuitBreakerTripped = true;
        ctx.addAudit('governor', 'task:rejected', { taskId: task.id, reason });
        logger.warn('Execution: task rejected', {
          taskId: task.id,
          reason,
        });
        return { taskId: task.id, status: 'skipped', error: reason };
      }
    }

    // Execute through the concrete path declared by each skill descriptor.
    ctx.addAudit('executor', 'task:start', { taskId: task.id, objective: task.objective });

    const dependencyOutputs = new Map<string, unknown>();
    for (const dep of task.dependsOn) {
      if (completedOutputs.has(dep)) {
        dependencyOutputs.set(dep, completedOutputs.get(dep));
      }
    }

    const memoryContext = resolveMemoryContext(ctx.sanitizedIntent?.context);

    const baseInput: SkillInput = {
      objective: task.objective,
      context: memoryContext,
      dependencyOutputs,
      sessionId: ctx.sessionId,
      projectId: ctx.projectId,
    };
    logger.debug('Execution: skill input', { taskId: task.id, input: baseInput });

    if (task.requiredSkills.length === 0) {
      const passthroughOutput =
        dependencyOutputs.size === 1
          ? dependencyOutputs.values().next().value
          : dependencyOutputs;

      await memory.recordTrace({
        taskId: task.id,
        summary: task.objective,
        outcome: 'success',
        timestamp: new Date().toISOString(),
      });

      ctx.addAudit('executor', 'task:complete', {
        taskId: task.id,
        tokensUsed: 0,
        output: passthroughOutput,
      });
      logger.info('Execution: task complete', {
        taskId: task.id,
        status: 'success',
        tokensUsed: 0,
      });
      logger.debug('Execution: task timing', {
        taskId: task.id,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
      });

      return { taskId: task.id, status: 'success', output: passthroughOutput };
    }

    for (const skillId of task.requiredSkills) {
      if (!skills.hasSkill(skillId)) {
        throw new Error(`Missing required skill: ${skillId}`);
      }
    }

    let output: unknown;
    let tokensUsed = 0;

    const availableSkills = skills.getAvailableSkills();

    for (const skillId of task.requiredSkills) {
      const descriptor = availableSkills.find(sk => sk.id === skillId);
      const isCli = descriptor?.executionType === 'cli' || (!descriptor && skillId.startsWith('cli:'));
      const isMcp = descriptor?.executionType === 'mcp';

      let result;
      if (isCli) {
        if (!cliExecutor) {
          throw new Error(`CLI skill '${skillId}' requires a CliSkillExecutor but none was provided`);
        }
        result = await cliExecutor.execute(skillId, baseInput, {} as never, checkpoint, task.id);
      } else if (isMcp) {
        result = await executeMcpSkill(skillId, baseInput, mcp);
      } else {
        result = await skills.execute(skillId, baseInput);
      }

      output = result.output;
      tokensUsed += result.tokensUsed ?? 0;
      logger.debug('Execution: skill complete', { taskId: task.id, skillId, tokensUsed });
    }

    // Record trace
    await memory.recordTrace({
      taskId: task.id,
      summary: task.objective,
      outcome: 'success',
      timestamp: new Date().toISOString(),
    });

    ctx.addAudit('executor', 'task:complete', { taskId: task.id, tokensUsed, output });
    logger.info('Execution: task complete', {
      taskId: task.id,
      status: 'success',
      tokensUsed,
    });
    logger.debug('Execution: task timing', {
      taskId: task.id,
      durationMs: Date.now() - startTime,
      tokensUsed,
    });
    return { taskId: task.id, status: 'success', output };
  } catch (error) {
    const errorObject = error instanceof Error ? error : new Error(String(error));
    ctx.errorContext = [...(ctx.errorContext ?? []), errorObject];
    ctx.circuitBreakerTripped = true;
    const errorMsg = errorObject.message;
    ctx.addAudit('executor', 'task:failed', { taskId: task.id, error: errorMsg });
    logger.error('Execution: task failed', { taskId: task.id, error: errorMsg });
    logger.debug('Execution: task timing', {
      taskId: task.id,
      durationMs: Date.now() - startTime,
      tokensUsed: 0,
    });
    return { taskId: task.id, status: 'failure', error: errorMsg };
  } finally {
    span?.end({ taskId: task.id });
  }
}

async function executeMcpSkill(
  skillId: string,
  input: SkillInput,
  mcp?: IMcpModule,
): Promise<{ output: unknown; tokensUsed: number }> {
  if (!mcp) {
    throw new Error(
      `MCP skill '${skillId}' requires an IMcpModule but none was provided. ` +
        'Wire a live MCP module into runExecution/createBeastDeps or disable the MCP skill.',
    );
  }

  const tool = resolveMcpTool(skillId, mcp.getAvailableTools());
  const result = await mcp.callTool(tool.name, serializeMcpSkillInput(input, tool.inputSchema), tool.serverId);

  if (result.isError) {
    throw new Error(`MCP skill '${skillId}' failed via tool '${tool.name}': ${String(result.content)}`);
  }

  return { output: result.content, tokensUsed: 0 };
}

function resolveMcpTool(
  skillId: string,
  tools: ReturnType<IMcpModule['getAvailableTools']>,
): McpToolInfo {
  const namespaced = parseNamespacedToolId(skillId);
  if (namespaced) {
    const matches = tools.filter(tool => tool.serverId === namespaced.serverId && tool.name === namespaced.toolName);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      throw new Error(`MCP skill '${skillId}' is ambiguous: multiple MCP tools match that namespaced id.`);
    }
  }

  const byName = tools.filter(tool => tool.name === skillId);
  const byServer = tools.filter(tool => tool.serverId === skillId);

  if (byName.length > 1) {
    throw new Error(
      `MCP skill '${skillId}' is ambiguous: multiple MCP servers expose a tool named '${skillId}' ` +
        `(${byName.map(tool => tool.serverId).join(', ')}). Use an unambiguous server/tool id.`,
    );
  }

  const exactTool = byName[0];
  if (exactTool && exactTool.serverId === skillId) return exactTool;

  if (exactTool && byServer.length > 0) {
    throw new Error(
      `MCP skill '${skillId}' is ambiguous: it matches tool '${exactTool.name}' from server '${exactTool.serverId}' ` +
        `and server '${skillId}' tools (${byServer.map(tool => tool.name).join(', ')}). ` +
        'Use an unambiguous tool id or server id.',
    );
  }

  if (exactTool) return exactTool;
  if (byServer.length === 1) return byServer[0]!;

  if (byServer.length > 1) {
    throw new Error(
      `MCP skill '${skillId}' maps to multiple MCP tools (${byServer.map(tool => tool.name).join(', ')}). ` +
        'Use a required skill id that matches the intended MCP tool name, or expose exactly one tool for this skill server.',
    );
  }

  const available = tools.map(tool => `${tool.serverId}/${tool.name}`).join(', ') || 'none';
  throw new Error(
    `MCP skill '${skillId}' is enabled but no matching MCP tool/server is available. ` +
      `Expected a tool named '${skillId}' or exactly one tool from server '${skillId}'. Available MCP tools: ${available}. ` +
      'Start/configure the MCP server or disable the skill.',
  );
}

function parseNamespacedToolId(skillId: string): { serverId: string; toolName: string } | undefined {
  const separator = skillId.indexOf('/');
  if (separator <= 0 || separator === skillId.length - 1) return undefined;
  return {
    serverId: skillId.slice(0, separator),
    toolName: skillId.slice(separator + 1),
  };
}

function serializeMcpSkillInput(input: SkillInput, inputSchema?: Record<string, unknown>): Record<string, unknown> {
  const genericInput = {
    objective: input.objective,
    context: input.context,
    dependencyOutputs: Object.fromEntries(input.dependencyOutputs),
    sessionId: input.sessionId,
    projectId: input.projectId,
  };

  const properties = getSchemaProperties(inputSchema);
  if (!properties) return genericInput;

  const schemaInput: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    if (key in genericInput) {
      schemaInput[key] = genericInput[key as keyof typeof genericInput];
    }
  }

  if ('query' in properties && !('query' in schemaInput)) {
    schemaInput.query = input.objective;
  }
  if ('prompt' in properties && !('prompt' in schemaInput)) {
    schemaInput.prompt = input.objective;
  }
  if ('input' in properties && !('input' in schemaInput)) {
    schemaInput.input = input.objective;
  }
  if ('content' in properties && !('content' in schemaInput)) {
    schemaInput.content = input.objective;
  }

  return schemaInput;
}

function getSchemaProperties(inputSchema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return undefined;
  }
  return properties as Record<string, unknown>;
}

function resolveMemoryContext(
  context: Record<string, unknown> | undefined,
): MemoryContext {
  if (
    context &&
    Array.isArray(context.adrs) &&
    Array.isArray(context.knownErrors) &&
    Array.isArray(context.rules)
  ) {
    return {
      adrs: context.adrs as string[],
      knownErrors: context.knownErrors as string[],
      rules: context.rules as string[],
    };
  }

  return { adrs: [], knownErrors: [], rules: [] };
}
