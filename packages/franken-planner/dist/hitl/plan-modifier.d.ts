import { PlanGraph } from '../core/dag.js';
import type { TaskModification } from './types.js';
/**
 * Applies a set of TaskModification changes to a PlanGraph and returns a new graph.
 * Modifications that reference unknown task ids are silently ignored.
 * Edges (dependencies) are fully preserved.
 * The original graph is not mutated (ADR-007).
 */
export declare function applyModifications(graph: PlanGraph, changes: TaskModification[]): PlanGraph;
//# sourceMappingURL=plan-modifier.d.ts.map