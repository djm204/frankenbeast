import type { BeastLoopDeps } from './deps.js';
import type { BeastInput, BeastResult } from './types.js';
import type { OrchestratorConfig } from './config/orchestrator-config.js';
import { defaultConfig } from './config/orchestrator-config.js';
import { createContext } from './context/context-factory.js';
import { runIngestion, InjectionDetectedError } from './phases/ingestion.js';
import { runHydration } from './phases/hydration.js';
import { runPlanning, CritiqueSpiralError } from './phases/planning.js';
import { runExecution } from './phases/execution.js';
import { runClosure } from './phases/closure.js';

/**
 * The Beast Loop — main orchestrator that wires all 8 modules.
 *
 * Phases:
 * 1. Ingestion — sanitize input via Firewall + hydrate from Memory
 * 2. Planning — create + critique plan via Planner/Critique
 * 3. Execution — run tasks via Skills/Governor
 * 4. Closure — finalize traces, heartbeat pulse
 */
export class BeastLoop {
  private readonly deps: BeastLoopDeps;
  private readonly config: OrchestratorConfig;

  constructor(deps: BeastLoopDeps, config?: Partial<OrchestratorConfig>) {
    this.deps = deps;
    this.config = { ...defaultConfig(), ...config };
  }

  async run(input: BeastInput): Promise<BeastResult> {
    const ctx = createContext(input);
    const logger = this.deps.logger;
    logger.info('BeastLoop: session start', {
      sessionId: ctx.sessionId,
      projectId: ctx.projectId,
    });
    logger.debug('BeastLoop: session context', {
      sessionId: ctx.sessionId,
      projectId: ctx.projectId,
    });
    logger.debug('BeastLoop: input', { input });
    logger.debug('BeastLoop: config', this.config);

    try {
      // Phase 1: Ingestion + Hydration
      if (this.config.enableTracing) {
        this.deps.observer.startTrace(ctx.sessionId);
      }
      logger.info('BeastLoop: phase start', { phase: 'ingestion' });
      await runIngestion(ctx, this.deps.firewall, logger);
      logger.info('BeastLoop: phase end', { phase: 'ingestion' });

      logger.info('BeastLoop: phase start', { phase: 'hydration' });
      await runHydration(ctx, this.deps.memory, logger);
      logger.info('BeastLoop: phase end', { phase: 'hydration' });

      // Phase 2: Planning + Critique
      logger.info('BeastLoop: phase start', { phase: 'planning' });
      await runPlanning(
        ctx,
        this.deps.planner,
        this.deps.critique,
        this.config,
        logger,
        this.deps.graphBuilder,
      );
      logger.info('BeastLoop: phase end', { phase: 'planning' });

      await this.maybeRunReflection('after-planning', ctx, logger);

      // Phase 3: Execution
      logger.info('BeastLoop: phase start', { phase: 'execution' });
      const outcomes = await runExecution(
        ctx,
        this.deps.skills,
        this.deps.governor,
        this.deps.memory,
        this.deps.observer,
        this.deps.mcp,
        logger,
        this.deps.cliExecutor,
        this.deps.checkpoint,
        this.deps.refreshPlanTasks,
      );
      logger.info('BeastLoop: phase end', { phase: 'execution' });

      await this.maybeRunReflection('after-execution', ctx, logger);

      // Phase 4: Closure
      logger.info('BeastLoop: phase start', { phase: 'closure' });
      const result = await runClosure(
        ctx,
        this.deps.observer,
        this.deps.heartbeat,
        this.config,
        outcomes,
        logger,
        this.deps.prCreator,
      );
      logger.info('BeastLoop: phase end', { phase: 'closure' });
      logger.info('BeastLoop: session end', {
        status: result.status,
        durationMs: result.durationMs,
      });
      return result;
    } catch (error) {
      if (error instanceof InjectionDetectedError) {
        logger.error('BeastLoop: error', { error: error.message });
        return {
          sessionId: ctx.sessionId,
          projectId: ctx.projectId,
          phase: ctx.phase,
          status: 'aborted',
          tokenSpend: ctx.tokenSpend,
          abortReason: error.message,
          error,
          durationMs: ctx.elapsedMs(),
        };
      }

      if (error instanceof CritiqueSpiralError) {
        logger.error('BeastLoop: error', { error: error.message });
        return {
          sessionId: ctx.sessionId,
          projectId: ctx.projectId,
          phase: ctx.phase,
          status: 'aborted',
          tokenSpend: ctx.tokenSpend,
          abortReason: error.message,
          error,
          durationMs: ctx.elapsedMs(),
        };
      }

      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('BeastLoop: error', { error: err.message });
      return {
        sessionId: ctx.sessionId,
        projectId: ctx.projectId,
        phase: ctx.phase,
        status: 'failed',
        tokenSpend: ctx.tokenSpend,
        error: err,
        durationMs: ctx.elapsedMs(),
      };
    }
  }

  /**
   * Run optional LLM-based reflection at phase boundaries.
   * Advisory only — failures are logged but do not abort the run.
   */
  private async maybeRunReflection(
    stage: 'after-planning' | 'after-execution',
    ctx: { sessionId: string; phase: string },
    logger: { info(msg: string, data?: unknown): void; warn(msg: string, data?: unknown): void },
  ): Promise<void> {
    if (!this.config.enableReflection) return;

    try {
      const pulse = await this.deps.heartbeat.pulse();
      logger.info(`BeastLoop: reflection ${stage}`, {
        stage,
        summary: pulse.summary,
        improvements: pulse.improvements.length,
        techDebt: pulse.techDebt.length,
      });

      if (this.config.enableTracing) {
        this.deps.observer.startSpan(`reflection:${stage}`).end({
          summary: pulse.summary,
          improvements: pulse.improvements,
          techDebt: pulse.techDebt,
        });
      }
    } catch (err) {
      // Reflection is advisory — never fail the run
      logger.warn(`BeastLoop: reflection ${stage} failed (non-fatal)`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
