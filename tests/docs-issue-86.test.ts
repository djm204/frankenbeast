import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('issue #86 documentation accuracy', () => {
  it('marks shared @franken/types mismatches as resolved in the contract matrix', () => {
    const matrix = readDoc('docs/CONTRACT_MATRIX.md');

    expect(matrix).toContain('## Resolved Type Mismatches');
    for (const resolvedType of [
      'TaskId Branding',
      'Severity Scale Divergence',
      'RationaleBlock Duplication',
      'ILlmClient Return Type Divergence',
    ]) {
      expect(matrix).toMatch(
        new RegExp(`### \\d+\\. ${resolvedType}(?:(?!###)[\\s\\S])*?\\*\\*Status\\*\\*: Resolved`),
      );
    }
  });

  it('records explicit ADR supersession metadata for ADR-007 and ADR-010', () => {
    const adr007 = readDoc('docs/adr/007-cli-skill-execution-type.md');
    const adr010 = readDoc('docs/adr/010-pluggable-cli-providers.md');

    expect(adr007).toMatch(/^Supersedes: None$/m);
    expect(adr007).toMatch(/^Superseded by: ADR-010$/m);
    expect(adr010).toMatch(/^Supersedes: ADR-007$/m);
  });

  it('does not claim the stale Phase 7 baseline is the current all-pass test status', () => {
    const progress = readDoc('docs/PROGRESS.md');

    expect(progress).not.toContain('**ALL PASS**');
    expect(progress).toContain('Current tracked total');
    expect(progress).toContain('Known stale/failing-module caveat');
    expect(progress).toContain('#27');
    expect(progress).toContain('#30');
    expect(progress).toContain('#31');
  });
});
