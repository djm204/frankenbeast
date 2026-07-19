import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2857 secret-store argv safety documentation', () => {
  it('documents the OS keychain write limitations at both onboarding entrypoints', () => {
    for (const relativePath of ['README.md', 'ONBOARDING.md']) {
      const document = readText(relativePath);

      expect(document).toContain('Linux Secret Service');
      expect(document).toContain('macOS and Windows writes fail closed');
      expect(document).toContain('secret values in process arguments');
    }
  });

  it('documents the CLI requirements for stdin-safe 1Password and Bitwarden writes', () => {
    const readme = readText('README.md');

    expect(readme).toContain('1Password CLI 2.23.0 or newer');
    expect(readme).toContain('stdin instead of command-line arguments');
    expect(readme).toContain('Bitwarden CLI');
  });
});
