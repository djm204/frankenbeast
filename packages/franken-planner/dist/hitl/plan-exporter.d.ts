import type { PlanGraph } from '../core/dag.js';
/**
 * Renders a PlanGraph as a Markdown checklist for HITL review (ADR-006).
 * Output is deterministic: tasks appear in topological order.
 */
export declare class PlanExporter {
    toMarkdown(graph: PlanGraph): string;
}
//# sourceMappingURL=plan-exporter.d.ts.map