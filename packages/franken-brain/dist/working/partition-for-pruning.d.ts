import type { WorkingTurn } from '../types/index.js';
export interface PartitionResult {
    preserved: WorkingTurn[];
    candidates: WorkingTurn[];
}
/**
 * Splits turns into those that must survive pruning and those that can be
 * compressed. Pure function — no side effects.
 *
 * Preservation rules (in priority order):
 *  1. Turns marked `pinned: true`
 *  2. The most recent Plan turn (assistant role, content starts with "[Plan]")
 *  3. The most recent tool turn (role === "tool")
 */
export declare function partitionForPruning(turns: WorkingTurn[]): PartitionResult;
//# sourceMappingURL=partition-for-pruning.d.ts.map