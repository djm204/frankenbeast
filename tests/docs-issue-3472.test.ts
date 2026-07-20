import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

describe('issue #3472 README testing baseline', () => {
  it('points contributors to maintained commands instead of historical PR progress', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    const projectStatus = readme.slice(
      readme.indexOf('## Project Status'),
      readme.indexOf('### In Progress'),
    );

    expect(projectStatus).toContain('`npm test`, `npm run typecheck`, and `npm run build`');
    expect(projectStatus).toContain(
      '[test command decision tree](docs/onboarding/test-command-decision-tree.md)',
    );
    expect(projectStatus).toContain('historical implementation chronology only');
    expect(projectStatus).toContain('it does not define the current testing baseline');
    expect(projectStatus).not.toContain('for the full PR-by-PR breakdown');
  });
});
