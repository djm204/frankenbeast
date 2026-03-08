import type { BeastContext } from '../context/franken-context.js';
import type { IFirewallModule, ILogger } from '../deps.js';
import { NullLogger } from '../logger.js';

export class InjectionDetectedError extends Error {
  constructor(
    public readonly violations: readonly { rule: string; severity: string; detail: string }[],
  ) {
    super('Input blocked by firewall: injection detected');
    this.name = 'InjectionDetectedError';
  }
}

/**
 * Beast Loop Phase 1a: Ingestion
 * Sends raw user input through the firewall pipeline.
 * If blocked (injection detected), throws InjectionDetectedError.
 * Otherwise, stores sanitised intent on the context.
 */
export async function runIngestion(
  ctx: BeastContext,
  firewall: IFirewallModule,
  logger: ILogger = new NullLogger(),
): Promise<void> {
  ctx.phase = 'ingestion';
  ctx.addAudit('firewall', 'pipeline:start', { input: ctx.userInput });
  logger.info('Ingestion: input received', { inputLength: ctx.userInput.length });
  logger.debug('Ingestion: input raw', { input: ctx.userInput });

  const result = await firewall.runPipeline(ctx.userInput);
  logger.info('Ingestion: firewall result', {
    blocked: result.blocked,
    violations: result.violations,
  });

  if (result.blocked) {
    ctx.addAudit('firewall', 'pipeline:blocked', { violations: result.violations });
    logger.warn('Ingestion: blocked', { violations: result.violations, blocked: true });
    throw new InjectionDetectedError(result.violations);
  }

  ctx.sanitizedIntent = {
    goal: result.sanitizedText,
  };

  ctx.addAudit('firewall', 'pipeline:clean', {
    sanitizedLength: result.sanitizedText.length,
    warningCount: result.violations.length,
  });
  logger.info('Ingestion: sanitized', { sanitizedLength: result.sanitizedText.length });
}
