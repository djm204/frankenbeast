import { NullLogger } from '../logger.js';
export class HitlRejectedError extends Error {
    taskId;
    reason;
    constructor(taskId, reason) {
        super(`Task ${taskId} rejected by governor: ${reason}`);
        this.taskId = taskId;
        this.reason = reason;
        this.name = 'HitlRejectedError';
    }
}
/**
 * Beast Loop Phase 3: Validated Execution
 * Executes tasks from the plan in topological order.
 * For each task: check HITL → governor approval → execute → record trace → emit span.
 */
export async function runExecution(ctx, skills, governor, memory, observer, mcp, logger = new NullLogger(), cliExecutor, checkpoint, refreshPlanTasks) {
    ctx.phase = 'execution';
    ctx.addAudit('orchestrator', 'phase:start', { phase: 'execution' });
    logger.info('Execution: start', { phase: 'execution' });
    if (!ctx.plan) {
        throw new Error('Cannot execute without a plan — planning phase incomplete');
    }
    const outcomes = [];
    const completed = new Set();
    const completedOutputs = new Map();
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
                ctx.plan = { tasks: [...ctx.plan.tasks, ...latestTasks.filter(t => !ctx.plan.tasks.some(p => p.id === t.id))] };
                logger.info('Execution: plan refreshed', {
                    addedTasks: addedCount,
                    totalTasks: knownTaskIds.size,
                });
            }
        }
        const readyIndex = pending.findIndex(t => t.dependsOn.every(dep => completed.has(dep)));
        if (readyIndex === -1) {
            // All remaining tasks have unmet dependencies — deadlock
            for (const task of pending) {
                outcomes.push({
                    taskId: task.id,
                    status: 'skipped',
                    error: 'Unmet dependencies',
                });
            }
            break;
        }
        const task = pending.splice(readyIndex, 1)[0];
        // Skip tasks already completed in a previous run (checkpoint recovery)
        if (checkpoint?.has(`${task.id}:done`)) {
            logger.info('Execution: Skipping checkpointed task', { taskId: task.id });
            outcomes.push({ taskId: task.id, status: 'success' });
            completed.add(task.id);
            continue;
        }
        const outcome = await executeTask(task, skills, governor, memory, observer, ctx, completedOutputs, mcp, logger, cliExecutor, checkpoint);
        outcomes.push(outcome);
        if (outcome.status === 'success') {
            completed.add(task.id);
            completedOutputs.set(task.id, outcome.output);
            checkpoint?.write(`${task.id}:done`);
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
async function executeTask(task, skills, governor, memory, observer, ctx, completedOutputs, _mcp, logger = new NullLogger(), cliExecutor, checkpoint) {
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
            if (approval.decision === 'rejected' || approval.decision === 'abort') {
                ctx.addAudit('governor', 'task:rejected', { taskId: task.id, reason: approval.reason });
                logger.warn('Execution: task rejected', {
                    taskId: task.id,
                    reason: approval.reason,
                });
                return { taskId: task.id, status: 'skipped', error: approval.reason ?? 'Rejected' };
            }
        }
        // Execute (placeholder — real execution calls skill registry)
        ctx.addAudit('executor', 'task:start', { taskId: task.id, objective: task.objective });
        const dependencyOutputs = new Map();
        for (const dep of task.dependsOn) {
            if (completedOutputs.has(dep)) {
                dependencyOutputs.set(dep, completedOutputs.get(dep));
            }
        }
        const memoryContext = resolveMemoryContext(ctx.sanitizedIntent?.context);
        const baseInput = {
            objective: task.objective,
            context: memoryContext,
            dependencyOutputs,
            sessionId: ctx.sessionId,
            projectId: ctx.projectId,
        };
        logger.debug('Execution: skill input', { taskId: task.id, input: baseInput });
        if (task.requiredSkills.length === 0) {
            const passthroughOutput = dependencyOutputs.size === 1
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
        let output;
        let tokensUsed = 0;
        const availableSkills = skills.getAvailableSkills();
        for (const skillId of task.requiredSkills) {
            const descriptor = availableSkills.find(sk => sk.id === skillId);
            const isCli = descriptor?.executionType === 'cli';
            let result;
            if (isCli) {
                if (!cliExecutor) {
                    throw new Error(`CLI skill '${skillId}' requires a CliSkillExecutor but none was provided`);
                }
                result = await cliExecutor.execute(skillId, baseInput, {}, checkpoint, task.id);
            }
            else {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
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
    }
    finally {
        span.end({ taskId: task.id });
    }
}
function resolveMemoryContext(context) {
    if (context &&
        Array.isArray(context.adrs) &&
        Array.isArray(context.knownErrors) &&
        Array.isArray(context.rules)) {
        return {
            adrs: context.adrs,
            knownErrors: context.knownErrors,
            rules: context.rules,
        };
    }
    return { adrs: [], knownErrors: [], rules: [] };
}
//# sourceMappingURL=execution.js.map