import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
const ARCHITECTURE = README.slice(
  README.indexOf('## Architecture'),
  README.indexOf('## Current workspace packages'),
);

describe('issue #3414 accessible architecture diagrams', () => {
  it('maps every legacy MOD label to its current implementation surface', () => {
    const mappings = [
      ['MOD-01', '@franken/orchestrator firewall'],
      ['MOD-02', '@franken/orchestrator skills'],
      ['MOD-03', '@franken/brain'],
      ['MOD-04', '@franken/planner'],
      ['MOD-05', '@franken/observer'],
      ['MOD-06', '@franken/critique'],
      ['MOD-07', '@franken/governor'],
      ['MOD-08', '@franken/orchestrator heartbeat'],
    ] as const;

    for (const [legacyLabel, currentSurface] of mappings) {
      expect(ARCHITECTURE).toContain(`\`${legacyLabel}\` → \`${currentSurface}\``);
    }
  });

  it('provides a visible text alternative immediately before each Mermaid diagram', () => {
    const mermaidDiagrams = [...ARCHITECTURE.matchAll(/```mermaid/g)];
    const textAlternatives = [...ARCHITECTURE.matchAll(/\*\*Text alternative[^*]*:\*\*/g)];

    expect(mermaidDiagrams).toHaveLength(3);
    expect(textAlternatives).toHaveLength(3);

    for (let index = 0; index < mermaidDiagrams.length; index += 1) {
      const diagramStart = mermaidDiagrams[index]?.index ?? -1;
      const alternativeStart = textAlternatives[index]?.index ?? -1;
      const previousDiagramEnd = index === 0
        ? 0
        : (mermaidDiagrams[index - 1]?.index ?? 0) + '```mermaid'.length;

      expect(alternativeStart).toBeGreaterThan(previousDiagramEnd);
      expect(alternativeStart).toBeLessThan(diagramStart);
    }
  });

  it('describes the complete non-visual flow and external connections', () => {
    for (const requiredText of [
      'User input enters ingestion',
      'Planning builds and critiques a task graph',
      'Execution resolves tools and requests human approval',
      'Closure records observability data and performs reflection',
      'returns the final BeastResult to the user',
      'External LLM providers connect through the firewall adapter',
      'external MCP servers connect through the MCP suite registry and client',
    ]) {
      expect(ARCHITECTURE).toContain(requiredText);
    }
  });
});
