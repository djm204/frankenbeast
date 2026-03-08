import { NullLogger } from '../logger.js';
export class CritiqueSpiralError extends Error {
    iterations;
    lastScore;
    constructor(iterations, lastScore) {
        super(`Critique spiral: ${iterations} iterations, last score ${lastScore}`);
        this.iterations = iterations;
        this.lastScore = lastScore;
        this.name = 'CritiqueSpiralError';
    }
}
/**
 * Beast Loop Phase 2: Planning + Critique Review
 * Creates a plan from the sanitized intent, then runs critique loop.
 * If critique fails after maxCritiqueIterations, throws CritiqueSpiralError.
 */
export async function runPlanning(ctx, planner, critique, config, logger = new NullLogger(), graphBuilder) {
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
        return;
    }
    let lastScore = 0;
    for (let i = 0; i < config.maxCritiqueIterations; i++) {
        if (i > 0) {
            logger.info('Planning: replan', { iteration: i + 1 });
        }
        // Create or re-create plan
        const plan = await planner.createPlan({
            goal: ctx.sanitizedIntent.goal,
            strategy: ctx.sanitizedIntent.strategy,
            context: ctx.sanitizedIntent.context,
        });
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
        if (critiqueResult.verdict === 'pass' && critiqueResult.score >= config.minCritiqueScore) {
            return; // Plan approved
        }
    }
    // Exhausted iterations
    throw new CritiqueSpiralError(config.maxCritiqueIterations, lastScore);
}
//# sourceMappingURL=planning.js.map