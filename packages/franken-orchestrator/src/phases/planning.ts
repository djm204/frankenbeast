import type { BeastContext } from '../context/franken-context.js';
import type { IPlannerModule, ICritiqueModule, ILogger, PlanGraph, PlanIntent } from '../deps.js';
import type { GraphBuilder } from '../planning/chunk-file-graph-builder.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { NullLogger } from '../logger.js';

export class CritiqueSpiralError extends Error {
  constructor(
    public readonly iterations: number,
    public readonly lastScore: number,
  ) {
    super(`Critique spiral: ${iterations} iterations, last score ${lastScore}`);
    this.name = 'CritiqueSpiralError';
  }
}

/**
 * Thrown when the critique loop halts on a budget (or other halt-action) breaker.
 * Distinct from CritiqueSpiralError: a halt is terminal and must stop planning
 * immediately, not trigger another planner call.
 */
export class CritiqueBudgetHaltError extends Error {
  constructor(
    public readonly iterations: number,
    public readonly reason: string,
  ) {
    super(`Critique halted at iteration ${iterations}: ${reason}`);
    this.name = 'CritiqueBudgetHaltError';
  }
}

/**
 * Beast Loop Phase 2: Planning + Critique Review
 * Creates a plan from the sanitized intent, then runs critique loop.
 * If critique fails after maxCritiqueIterations, throws CritiqueSpiralError.
 */
export async function runPlanning(
  ctx: BeastContext,
  planner: IPlannerModule,
  critique: ICritiqueModule,
  config: OrchestratorConfig,
  logger: ILogger = new NullLogger(),
  graphBuilder?: GraphBuilder,
): Promise<void> {
  ctx.phase = 'planning';
  ctx.addAudit('orchestrator', 'phase:start', { phase: 'planning' });
  logger.info('Planning: start', { phase: 'planning' });
  logger.debug('Planning: sanitized intent', { sanitizedIntent: ctx.sanitizedIntent });

  if (!ctx.sanitizedIntent) {
    throw new Error('Cannot plan without sanitizedIntent — ingestion phase incomplete');
  }

  if (graphBuilder) {
    const plan = await graphBuilder.build({
      goal: ctx.sanitizedIntent.goal,
      strategy: ctx.sanitizedIntent.strategy,
      context: ctx.sanitizedIntent.context,
    });

    ctx.plan = plan;
    ctx.addAudit('planner', 'plan:created', {
      iteration: 1,
      taskCount: plan.tasks.length,
      source: 'graphBuilder',
    });
    logger.info('Planning: plan created', { iteration: 1, taskCount: plan.tasks.length });
    logger.debug('Planning: plan raw', { plan });

    // A graph-builder plan (e.g. issue/chunk-driven CLI runs) is not exempt
    // from safety review just because it wasn't produced by the planner
    // module — see issue #20. There is no planner to retry against here, so
    // failing or halted review stops planning outright instead of silently
    // handing an unreviewed plan to execution. Redact fenced chunk bodies for
    // this review so raw import examples in chunk specs are not treated as plan
    // dependencies by deterministic dependency evaluators.
    const critiqueResult = await critique.reviewPlan(buildGraphBuilderCritiquePlan(plan), {
      source: 'graphBuilder',
      redactedUntrustedChunkContent: true,
    });
    if (critiqueResult.findings.length > 0) {
      ctx.critiqueFeedback = critiqueResult.findings
        .map(finding => `${finding.evaluator}: ${finding.message}`)
        .join('\n');
    } else {
      ctx.critiqueFeedback = undefined;
    }

    ctx.addAudit('critique', 'plan:reviewed', {
      iteration: 1,
      verdict: critiqueResult.verdict,
      score: critiqueResult.score,
      findingsCount: critiqueResult.findings.length,
      source: 'graphBuilder',
    });
    logger.info('Planning: critique reviewed', {
      iteration: 1,
      verdict: critiqueResult.verdict,
      score: critiqueResult.score,
    });
    logger.debug('Planning: critique findings', { findings: critiqueResult.findings });

    if (critiqueResult.halted) {
      const reason = critiqueResult.haltReason ?? 'critique halted';
      ctx.addAudit('critique', 'plan:halted', { iteration: 1, reason });
      logger.warn('Planning: critique halted', { iteration: 1, reason });
      throw new CritiqueBudgetHaltError(1, reason);
    }

    if (critiqueResult.verdict === 'pass' && critiqueResult.score >= config.minCritiqueScore) {
      return; // Plan approved
    }

    // No planner to iterate against — a single failing review is terminal.
    throw new CritiqueSpiralError(1, critiqueResult.score);
  }

  let lastScore = 0;

  for (let i = 0; i < config.maxCritiqueIterations; i++) {
    if (i > 0) {
      logger.info('Planning: replan', { iteration: i + 1 });
    }
    // Create or re-create plan. On replans, carry the prior critique feedback
    // into the planner request so the iteration can actually repair the plan
    // instead of receiving identical input and repeating until CritiqueSpiralError.
    const planIntent: PlanIntent = {
      goal: ctx.sanitizedIntent.goal,
      strategy: ctx.sanitizedIntent.strategy,
      context: ctx.critiqueFeedback
        ? { ...ctx.sanitizedIntent.context, critiqueFeedback: ctx.critiqueFeedback }
        : ctx.sanitizedIntent.context,
    };
    const plan = await planner.createPlan(planIntent);

    ctx.plan = plan;
    ctx.addAudit('planner', 'plan:created', {
      iteration: i + 1,
      taskCount: plan.tasks.length,
    });
    logger.info('Planning: plan created', { iteration: i + 1, taskCount: plan.tasks.length });
    logger.debug('Planning: plan raw', { plan });

    // Critique the plan
    const critiqueResult = await critique.reviewPlan(plan);
    lastScore = critiqueResult.score;
    if (critiqueResult.findings.length > 0) {
      ctx.critiqueFeedback = critiqueResult.findings
        .map(finding => `${finding.evaluator}: ${finding.message}`)
        .join('\n');
    } else {
      // A clean review supersedes any earlier findings; clear the stale text so
      // downstream recovery/closure logic doesn't treat an approved plan as
      // still needing the previous fixes.
      ctx.critiqueFeedback = undefined;
    }

    ctx.addAudit('critique', 'plan:reviewed', {
      iteration: i + 1,
      verdict: critiqueResult.verdict,
      score: critiqueResult.score,
      findingsCount: critiqueResult.findings.length,
    });
    logger.info('Planning: critique reviewed', {
      iteration: i + 1,
      verdict: critiqueResult.verdict,
      score: critiqueResult.score,
    });
    logger.debug('Planning: critique findings', { findings: critiqueResult.findings });

    // A halt (e.g. the cost/token budget breaker) is terminal: stop here rather
    // than looping into another planner.createPlan call, which would keep
    // spending after the budget is already exhausted.
    if (critiqueResult.halted) {
      const reason = critiqueResult.haltReason ?? 'critique halted';
      ctx.addAudit('critique', 'plan:halted', { iteration: i + 1, reason });
      logger.warn('Planning: critique halted', { iteration: i + 1, reason });
      throw new CritiqueBudgetHaltError(i + 1, reason);
    }

    if (critiqueResult.verdict === 'pass' && critiqueResult.score >= config.minCritiqueScore) {
      return; // Plan approved
    }
  }

  // Exhausted iterations
  throw new CritiqueSpiralError(config.maxCritiqueIterations, lastScore);
}

const CHUNK_CONTENT_BEGIN = 'BEGIN_UNTRUSTED_CHUNK_CONTENT:';

function buildGraphBuilderCritiquePlan(plan: PlanGraph): PlanGraph {
  return {
    tasks: plan.tasks.map(task => ({
      ...task,
      objective: redactUntrustedChunkContent(task.objective),
    })),
  };
}

function redactUntrustedChunkContent(objective: string): string {
  const contentStart = objective.indexOf(CHUNK_CONTENT_BEGIN);
  if (contentStart === -1) return objective;

  return `${objective.slice(0, contentStart)}[untrusted chunk content redacted for plan critique]`;
}
