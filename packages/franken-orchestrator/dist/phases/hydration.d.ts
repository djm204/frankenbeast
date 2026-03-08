import type { BeastContext } from '../context/franken-context.js';
import type { IMemoryModule, ILogger } from '../deps.js';
/**
 * Beast Loop Phase 1b: Hydration
 * Loads project context from memory (ADRs, known errors, rules).
 * Must run after ingestion so sanitizedIntent is available.
 */
export declare function runHydration(ctx: BeastContext, memory: IMemoryModule, logger?: ILogger): Promise<void>;
//# sourceMappingURL=hydration.d.ts.map