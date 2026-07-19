import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2653 README ramp-up onboarding link', () => {
  it('links the concise ramp-up guide from the README onboarding entrypoint', () => {
    const readme = readText('README.md');

    expect(readme).toContain('[RAMP_UP.md](docs/RAMP_UP.md)');
    expect(readme).toContain('quick contributor orientation');
  });
});
