import type { Intent } from '../core/types.js';
/**
 * MOD-01: Guardrails
 * Sanitizes raw user input into a typed Intent before handing off to MOD-04.
 */
export interface GuardrailsModule {
    getSanitizedIntent(rawInput: string): Promise<Intent>;
}
//# sourceMappingURL=mod01.d.ts.map