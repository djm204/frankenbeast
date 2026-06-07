import type { PlanGraph } from '../core/dag.js';

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>])/g, '\\$1');
}

/**
 * Renders a PlanGraph as a Markdown checklist for HITL review (ADR-006).
 * Output is deterministic: tasks appear in topological order.
 */
export class PlanExporter {
  toMarkdown(graph: PlanGraph): string {
    const tasks = graph.topoSort();

    if (tasks.length === 0) {
      return '# Plan\n\n_No tasks._\n';
    }

    const lines = ['# Plan', '', '## Tasks', ''];

    for (const task of tasks) {
      const deps = graph.getDependencies(task.id);
      const escapedDeps = deps.map((dep) => escapeMarkdownText(dep));
      const depsAnnotation =
        escapedDeps.length > 0 ? ` _(depends on: ${escapedDeps.join(', ')})_` : '';
      lines.push(
        `- [ ] **${escapeMarkdownText(task.id)}**: ${escapeMarkdownText(task.objective)}${depsAnnotation}`
      );
    }

    lines.push('');
    return lines.join('\n');
  }
}
