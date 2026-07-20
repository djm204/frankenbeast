import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readDoc(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function sectionBetween(doc: string, start: string, end: string): string {
  const startIndex = doc.indexOf(start);
  const endIndex = doc.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return doc.slice(startIndex, endIndex);
}

describe('issue #2652 architecture labels', () => {
  it('keeps README architecture diagrams on current package and implementation-surface names', () => {
    const readmeArchitecture = sectionBetween(
      readDoc('README.md'),
      '## Architecture',
      '## Current workspace packages',
    );

    const readmeDiagrams = [...readmeArchitecture.matchAll(/```mermaid\n[\s\S]*?\n```/g)]
      .map((match) => match[0])
      .join('\n');

    expect(readmeDiagrams).not.toMatch(/MOD-\d{2}/);
    expect(readmeArchitecture).not.toContain('still use MOD labels');
    expect(readmeArchitecture).toContain('@franken/orchestrator');
    expect(readmeArchitecture).toContain('@franken/mcp-suite');
    expect(readmeArchitecture).toContain('@franken/brain');
    expect(readmeArchitecture).toContain('@franken/planner');
    expect(readmeArchitecture).toContain('@franken/observer');
    expect(readmeArchitecture).toContain('@franken/critique');
    expect(readmeArchitecture).toContain('@franken/governor');
  });

  it('keeps the detailed architecture interconnection diagram off legacy MOD labels', () => {
    const moduleInterconnections = sectionBetween(
      readDoc('docs/ARCHITECTURE.md'),
      '## Module Interconnections',
      '## Port Interfaces',
    );

    expect(moduleInterconnections).not.toMatch(/MOD-\d{2}/);
    expect(moduleInterconnections).toContain('@franken/orchestrator');
    expect(moduleInterconnections).toContain('@franken/mcp-suite');
    expect(moduleInterconnections).toContain('@franken/brain');
    expect(moduleInterconnections).toContain('@franken/planner');
    expect(moduleInterconnections).toContain('@franken/observer');
    expect(moduleInterconnections).toContain('@franken/critique');
    expect(moduleInterconnections).toContain('@franken/governor');
  });
});
