import type { BeastContext } from '../context/franken-context.js';
import type { IMemoryModule, ILogger } from '../deps.js';
import { NullLogger } from '../logger.js';

/**
 * Beast Loop Phase 1b: Hydration
 * Loads project context from memory (ADRs, known errors, rules).
 * Must run after ingestion so sanitizedIntent is available.
 */
export async function runHydration(
  ctx: BeastContext,
  memory: IMemoryModule,
  logger: ILogger = new NullLogger(),
): Promise<void> {
  ctx.addAudit('memory', 'frontload:start', { projectId: ctx.projectId });
  logger.info('Hydration: frontload start', { projectId: ctx.projectId });

  await memory.frontload(ctx.projectId);
  logger.info('Hydration: frontload complete', { projectId: ctx.projectId });
  const memoryContext = await memory.getContext(ctx.projectId);
  logger.info('Hydration: context loaded', {
    adrs: memoryContext.adrs.length,
    knownErrors: memoryContext.knownErrors.length,
    rules: memoryContext.rules.length,
  });
  logger.debug('Hydration: context raw', { context: memoryContext });

  // Enrich the sanitized intent with project context
  if (ctx.sanitizedIntent) {
    ctx.sanitizedIntent.context = {
      adrs: memoryContext.adrs,
      knownErrors: memoryContext.knownErrors,
      rules: memoryContext.rules,
    };
  }

  ctx.addAudit('memory', 'frontload:done', {
    adrsLoaded: memoryContext.adrs.length,
    knownErrors: memoryContext.knownErrors.length,
    rulesLoaded: memoryContext.rules.length,
  });
}
