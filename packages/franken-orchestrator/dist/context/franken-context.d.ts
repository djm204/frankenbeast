import type { TokenSpend } from '@franken/types';
import type { BeastPhase } from '../types.js';
import type { PlanGraph } from '../deps.js';
/** Audit entry recording a module action during the Beast Loop. */
export interface AuditEntry {
    readonly timestamp: string;
    readonly module: string;
    readonly action: string;
    readonly detail: unknown;
}
/**
 * Mutable context that flows through all Beast Loop phases.
 * Each phase reads and writes to this shared state.
 */
export declare class BeastContext {
    readonly projectId: string;
    readonly sessionId: string;
    readonly userInput: string;
    sanitizedIntent?: {
        goal: string;
        strategy?: string | undefined;
        context?: Record<string, unknown> | undefined;
    } | undefined;
    plan?: PlanGraph | undefined;
    phase: BeastPhase;
    tokenSpend: TokenSpend;
    readonly audit: AuditEntry[];
    private readonly startTime;
    constructor(projectId: string, sessionId: string, userInput: string);
    /** Append an audit entry. */
    addAudit(module: string, action: string, detail: unknown): void;
    /** Elapsed time since context creation. */
    elapsedMs(): number;
}
//# sourceMappingURL=franken-context.d.ts.map