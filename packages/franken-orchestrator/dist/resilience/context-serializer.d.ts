import { BeastContext, type AuditEntry } from '../context/franken-context.js';
import type { BeastPhase } from '../types.js';
import type { PlanGraph } from '../deps.js';
import type { TokenSpend } from '@franken/types';
/** Serializable snapshot of a BeastContext. */
export interface ContextSnapshot {
    readonly projectId: string;
    readonly sessionId: string;
    readonly userInput: string;
    readonly phase: BeastPhase;
    readonly sanitizedIntent?: {
        goal: string;
        strategy?: string | undefined;
        context?: Record<string, unknown> | undefined;
    } | undefined;
    readonly plan?: PlanGraph | undefined;
    readonly tokenSpend: TokenSpend;
    readonly audit: readonly AuditEntry[];
    readonly savedAt: string;
}
/** Serialize a BeastContext to a JSON snapshot. */
export declare function serializeContext(ctx: BeastContext): ContextSnapshot;
/** Restore a BeastContext from a snapshot. */
export declare function deserializeContext(snapshot: ContextSnapshot): BeastContext;
/** Save context snapshot to a file. */
export declare function saveContext(ctx: BeastContext, filePath: string): Promise<void>;
/** Load context snapshot from a file. */
export declare function loadContext(filePath: string): Promise<BeastContext>;
//# sourceMappingURL=context-serializer.d.ts.map