/**
 * Renders a PlanGraph as a Markdown checklist for HITL review (ADR-006).
 * Output is deterministic: tasks appear in topological order.
 */
export class PlanExporter {
    toMarkdown(graph) {
        const tasks = graph.topoSort();
        if (tasks.length === 0) {
            return '# Plan\n\n_No tasks._\n';
        }
        const lines = ['# Plan', '', '## Tasks', ''];
        for (const task of tasks) {
            const deps = graph.getDependencies(task.id);
            const depsAnnotation = deps.length > 0 ? ` _(depends on: ${deps.join(', ')})_` : '';
            lines.push(`- [ ] **${task.id}**: ${task.objective}${depsAnnotation}`);
        }
        lines.push('');
        return lines.join('\n');
    }
}
//# sourceMappingURL=plan-exporter.js.map