import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GUIDE_PATH = 'docs/onboarding/dashboard-ux-contribution.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2529 dashboard UX contribution path', () => {
  it('is discoverable from contributor onboarding entrypoints', () => {
    expect(readText('README.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('CONTRIBUTING.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('docs/onboarding/README.md')).toContain('(dashboard-ux-contribution.md)');
  });

  it('provides a complete, accessible dashboard contribution workflow', () => {
    const guide = readText(GUIDE_PATH);

    for (const expected of [
      'title: Dashboard UX contribution checklist',
      '# Dashboard UX contribution checklist',
      '## 1. Reproduce and bound the problem',
      'viewport size and browser',
      '## 2. Start the narrowest useful dashboard',
      'npm --workspace @franken/web run dev',
      'npm --workspace @franken/web run dev:chat',
      '## 3. Follow existing UI and accessibility patterns',
      'keyboard-only operation',
      'visible focus',
      'loading, empty, error, disabled, and success states',
      '## 4. Add focused regression coverage',
      'npm run test --workspace @franken/web',
      'npm run typecheck --workspace @franken/web',
      'npm run lint --workspace @franken/web',
      'npm run build --workspace @franken/web',
      '## 5. Supply reviewable UX evidence',
      'before and after screenshots',
      'Closes #<issue-number>',
      'Redact sensitive values',
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
