import type { BeastContext } from '../context/franken-context.js';
import type {
  ISkillsModule,
  IGovernorModule,
  IMemoryModule,
  IObserverModule,
  PlanTask,
  SkillInput,
  IMcpModule,
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

  // Simple topological execution: iterate tasks, skip those with unmet deps
  const pending = [...ctx.plan.tasks];
  let iterations = 0;
  let maxIterations = Math.max(pending.length * 2, 10); // safety guard

  while (pending.length > 0 && iterations < maxIterations) {
    iterations++;
    if (refreshPlanTasks) {
      const latestTasks = await refreshPlanTasks();
      let addedCount = 0;
      for (const task of latestTasks) {
        if (!knownTaskIds.has(task.id)) {
          knownTaskIds.add(task.id);
          pending.push(task);
          addedCount++;
        }
      }
      if (addedCount > 0) {
        maxIterations += addedCount * 2;
        ctx.plan = { tasks: [...ctx.plan.tasks, ...latestTasks.filter(t => !ctx.plan!.tasks.some(p => p.id === t.id))] };
        logger.info('Execution: plan refreshed', {
          addedTasks: addedCount,
          totalTasks: knownTaskIds.size,
        });
      }
    }

    const readyIndex = pending.findIndex(t =>
      t.dependsOn.every(dep => completed.has(dep)),
    );

    if (readyIndex === -1) {
      // All remaining tasks have unmet dependencies — deadlock
      ctx.circuitBreakerTripped = true;
      for (const task of pending) {
        outcomes.push({
          taskId: task.id,
          status: 'skipped',
          error: 'Unmet dependencies',
        });
      }
      break;
    }

    const task = pending.splice(readyIndex, 1)[0]!;

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
  const result = await mcp.callTool(tool.name, serializeMcpSkillInput(input));

  if (result.isError) {
    throw new Error(`MCP skill '${skillId}' failed via tool '${tool.name}': ${String(result.content)}`);
  }

  return { output: result.content, tokensUsed: 0 };
}

function resolveMcpTool(
  skillId: string,
  tools: ReturnType<IMcpModule['getAvailableTools']>,
): { name: string; serverId: string } {
  const byName = tools.find(tool => tool.name === skillId);
  const byServer = tools.filter(tool => tool.serverId === skillId);

  if (byName && byServer.some(tool => tool !== byName)) {
    throw new Error(
      `MCP skill '${skillId}' is ambiguous: it matches tool '${byName.name}' from server '${byName.serverId}' ` +
        `and server '${skillId}' tools (${byServer.map(tool => tool.name).join(', ')}). ` +
        'Use an unambiguous tool id or server id.',
    );
  }

  if (byName) return byName;
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

function serializeMcpSkillInput(input: SkillInput): Record<string, unknown> {
  return {
    objective: input.objective,
    context: input.context,
    dependencyOutputs: Object.fromEntries(input.dependencyOutputs),
    sessionId: input.sessionId,
    projectId: input.projectId,
  };
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
