import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8')) as {
    scripts?: Record<string, string>;
  };
}

function readReadme(): string {
  return readFileSync(join(packageRoot, 'README.md'), 'utf-8');
}

describe('package testing scripts', () => {
  it('exposes and documents a discoverable integration test command', () => {
    const scripts = readPackageJson().scripts ?? {};

    expect(scripts['test:integration']).toBe('vitest run --reporter=verbose src/**/*.integration.test.ts');
    expect(scripts['test:integration']).toContain('src/**/*.integration.test.ts');
    expect(readReadme()).toContain('npm run test:integration');
    expect(readReadme()).toContain('Codex-specific prerequisite assertions are skipped');
  });
});