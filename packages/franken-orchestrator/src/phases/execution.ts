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
} from '../deps.js';
import type { TaskOutcome } from '../types.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import { NullLogger } from '../logger.js';

export class HitlRejectedError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly reason: string,
  ) {
    super(`Task ${taskId} rejected by governor: ${reason}`);
    this.name = 'HitlRejectedError';
  }
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
  const knownTaskIds = new Set(ctx.plan.tasks.map((t) => t.id));

  // Simple topological execution: keep a keyed FIFO queue so plan refreshes can
  // atomically add newly discovered tasks without duplicating overlapping work.
  const pending = new Map(ctx.plan.tasks.map((task) => [task.id, task]));
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

    const readyEntry = [...pending].find(([, task]) =>
      task.dependsOn.every(dep => completed.has(dep)),
    );

    if (!readyEntry) {
      // All remaining tasks have unmet dependencies — deadlock
      ctx.circuitBreakerTripped = true;
      for (const task of pending.values()) {
        outcomes.push({
          taskId: task.id,
          status: 'skipped',
          error: 'Unmet dependencies',
        });
      }
      break;
    }

    const [taskId, task] = readyEntry;
    pending.delete(taskId);

    // Skip tasks already completed in a previous run (checkpoint recovery)
    if (checkpoint?.has(`${task.id}:done`)) {
      logger.info('Execution: Skipping checkpointed task', { taskId: task.id });
      outcomes.push({ taskId: task.id, status: 'success' });
      completed.add(task.id);
      continue;
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
    );
    outcomes.push(outcome);

    if (outcome.status === 'success') {
      // Persist the checkpoint before mutating in-memory state so a crash here
      // is recovered as "done" on restart instead of silently re-running the task.
      checkpoint?.write(`${task.id}:done`);
      completed.add(task.id);
      completedOutputs.set(task.id, outcome.output);
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
): Promise<TaskOutcome> {
  ctx.retryCount = (ctx.retryCount ?? 0) + 1;
  const startTime = Date.now();
  const span = observer.startSpan(`task:${task.id}`);
  logger.info('Execution: task start', {
    taskId: task.id,
    skillIds: task.requiredSkills,
    dependsOn: task.dependsOn,
  });
  logger.debug('Execution: task detail', { task });

  try {
    // Dirty file resume: recover partial work from a crashed run.
    // Keep this inside try/catch so recovery failures are captured as task failures.
    if (checkpoint && cliExecutor && checkpoint.lastCommit(task.id, 'impl')) {
      await cliExecutor.recoverDirtyFiles(task.id, 'impl', checkpoint, logger);
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
        ctx.circuitBreakerTripped = true;
        ctx.addAudit('governor', 'task:rejected', { taskId: task.id, reason: approval.reason });
        logger.warn('Execution: task rejected', {
          taskId: task.id,
          reason: approval.reason,
        });
        return { taskId: task.id, status: 'skipped', error: approval.reason ?? 'Rejected' };
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
    await memory.recordTrace({
      taskId: task.id,
      summary: task.objective,
      outcome: 'failure',
      timestamp: new Date().toISOString(),
    });
    logger.debug('Execution: task timing', {
      taskId: task.id,
      durationMs: Date.now() - startTime,
      tokensUsed: 0,
    });
    return { taskId: task.id, status: 'failure', error: errorMsg };
  } finally {
    span.end({ taskId: task.id });
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
