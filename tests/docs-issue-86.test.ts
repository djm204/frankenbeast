import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `import.meta.dirname` is only available in Node >= 20.11, but the repo's
// engines allow >= 20.0.0; use the portable fileURLToPath pattern instead.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

    // ADR-007 (CLI skill execution primitives) is still the active design
    // reference; ADR-010 only changes provider selection and partially
    // supersedes ADR-009's deferred-provider consequence — not ADR-007.
    expect(adr007).toMatch(/^Supersedes: None$/m);
    expect(adr007).toMatch(/^Superseded by: None/m);
    expect(adr010).toMatch(/^Supersedes: ADR-009/m);
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
