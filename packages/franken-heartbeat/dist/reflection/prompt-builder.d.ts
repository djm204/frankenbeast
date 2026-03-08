import type { MemoryEntry } from '../modules/memory.js';
import type { Trace } from '../modules/observability.js';
export interface PromptContext {
    readonly traces: readonly Trace[];
    readonly failures: readonly MemoryEntry[];
    readonly successes: readonly MemoryEntry[];
}
export declare function buildReflectionPrompt(context: PromptContext): string;
//# sourceMappingURL=prompt-builder.d.ts.map