import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const bootstrapCommand = 'npm run bootstrap -- --no-docker';

describe('issue #2069 README bootstrap onboarding alignment', () => {
  it('keeps the README Quick Start aligned with the canonical bootstrap first-run path', () => {
    const readme = readDoc('README.md');
    const quickStart = readme.slice(
      readme.indexOf('## Quick Start'),
      readme.indexOf('## Run the Dashboard with MCP Mode'),
    );

    expect(quickStart).toContain(bootstrapCommand);
    expect(quickStart).toContain('ONBOARDING.md');
    expect(quickStart).toContain('docs/guides/quickstart.md');
    expect(quickStart).toContain('skipping bootstrap');
    expect(quickStart).not.toContain('# Install all dependencies\nnpm install');
  });

  it('keeps all first-run docs on the same default install command', () => {
    expect(readDoc('README.md')).toContain(bootstrapCommand);
    expect(readDoc('ONBOARDING.md')).toContain(bootstrapCommand);
    expect(readDoc('docs/guides/quickstart.md')).toContain(bootstrapCommand);
  });
});
