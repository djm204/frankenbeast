import type { BeastContext } from '../context/franken-context.js';
import type { IObserverModule, IHeartbeatModule, ILogger } from '../deps.js';
import type { BeastResult, TaskOutcome } from '../types.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { PrCreationRequiredActionError, type PrCreator } from '../closure/pr-creator.js';
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

  const hasOutcomes = taskOutcomes.length > 0;
  const allSucceeded = hasOutcomes && taskOutcomes.every(o => o.status === 'success');
  const allSkipped = hasOutcomes && taskOutcomes.every(o => o.status === 'skipped');
  // Only report no-op when every skipped outcome is a benign/intentional skip.
  // Skips caused by unmet dependencies or governor rejections always attach an
  // error field (possibly an empty reason), so test for its presence rather
  // than truthiness — an empty rejection reason must still count as a failure.
  const benignAllSkipped = allSkipped && taskOutcomes.every(o => o.error === undefined);

  // An empty plan (e.g. a no-op design that produced no chunk files) yields no
  // task outcomes; `[].every()` is vacuously true, so special-case it as no-op
  // instead of letting it fall through to a misleading `completed`.
  const status: BeastResult['status'] = !hasOutcomes || benignAllSkipped
    ? 'no-op'
    : allSucceeded
      ? 'completed'
      : 'failed';

  let result: BeastResult = {
    sessionId: ctx.sessionId,
    projectId: ctx.projectId,
    phase: 'closure',
    status,
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
      if (error instanceof PrCreationRequiredActionError) {
        logger.warn('Closure: PR creation requires user action', {
          message: error.message,
          action: error.action,
          branch: error.branch,
        });
        result = {
          ...result,
          status: 'failed',
          error,
        };
        return result;
      }
      logger.error('Closure: PR creation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
