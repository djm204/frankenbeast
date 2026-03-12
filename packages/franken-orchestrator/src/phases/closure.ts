import type { BeastContext } from '../context/franken-context.js';
import type { IObserverModule, IHeartbeatModule, ILogger } from '../deps.js';
import type { BeastResult, TaskOutcome } from '../types.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { PrCreator } from '../closure/pr-creator.js';
import { NullLogger } from '../logger.js';

/**
 * Beast Loop Phase 4: Closure
 * Finalizes traces, computes token spend, runs optional heartbeat pulse,
 * and assembles the final BeastResult.
 */
export async function runClosure(
  ctx: BeastContext,
  observer: IObserverModule,
  heartbeat: IHeartbeatModule,
  config: OrchestratorConfig,
  taskOutcomes: readonly TaskOutcome[],
  logger: ILogger = new NullLogger(),
  prCreator?: PrCreator,
): Promise<BeastResult> {
  ctx.phase = 'closure';
  ctx.addAudit('orchestrator', 'phase:start', { phase: 'closure' });
  logger.info('Closure: start', { phase: 'closure' });

  // Collect token spend
  const spend = await observer.getTokenSpend(ctx.sessionId);
  ctx.tokenSpend = spend;
  ctx.addAudit('observer', 'tokenSpend:collected', spend);
  logger.info('Closure: token spend', {
    inputTokens: spend.inputTokens,
    outputTokens: spend.outputTokens,
    totalTokens: spend.totalTokens,
    estimatedCostUsd: spend.estimatedCostUsd,
  });
  logger.debug('Closure: token spend raw', { spend });

  // Optional heartbeat pulse
  if (config.enableHeartbeat) {
    try {
      const pulseResult = await heartbeat.pulse();
      ctx.addAudit('heartbeat', 'pulse:complete', {
        improvements: pulseResult.improvements.length,
        techDebt: pulseResult.techDebt.length,
      });
      logger.info('Closure: heartbeat pulse', {
        improvements: pulseResult.improvements.length,
        techDebt: pulseResult.techDebt.length,
      });
      logger.debug('Closure: heartbeat raw', { pulseResult });
    } catch (error) {
      // Heartbeat failure is non-fatal
      ctx.addAudit('heartbeat', 'pulse:failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error('Closure: heartbeat failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allSucceeded = taskOutcomes.every(o => o.status === 'success');

  const result: BeastResult = {
    sessionId: ctx.sessionId,
    projectId: ctx.projectId,
    phase: 'closure',
    status: allSucceeded ? 'completed' : 'failed',
    tokenSpend: ctx.tokenSpend,
    taskResults: taskOutcomes,
    planSummary: ctx.plan
      ? `${ctx.plan.tasks.length} task(s) planned`
      : undefined,
    durationMs: ctx.elapsedMs(),
  };

  if (prCreator) {
    try {
      const pr = await prCreator.create(result, logger);
      if (pr) {
        (result as any).prUrl = pr.url;
      }
    } catch (error) {
      logger.error('Closure: PR creation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
