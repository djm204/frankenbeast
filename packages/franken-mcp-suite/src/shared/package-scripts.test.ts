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

function readVitestConfig(): string {
  return readFileSync(join(packageRoot, 'vitest.config.ts'), 'utf-8');
}

function readIntegrationVitestConfig(): string {
  return readFileSync(join(packageRoot, 'vitest.integration.config.ts'), 'utf-8');
}

describe('package testing scripts', () => {
  it('keeps default tests out of the integration suite', () => {
    const config = readVitestConfig();

    expect(config).toContain("include: ['src/**/*.test.ts']");
    expect(config).toContain("exclude: ['src/**/*.integration.test.ts']");
  });

  it('exposes and documents a discoverable integration test command', () => {
    const scripts = readPackageJson().scripts ?? {};

    expect(scripts['test:integration']).toBe(
      'vitest run --config vitest.integration.config.ts --reporter=verbose'
    );
    expect(readIntegrationVitestConfig()).toContain("include: ['src/**/*.integration.test.ts']");
    expect(readReadme()).toContain('npm run test:integration');
    expect(readReadme()).toContain('Codex-specific prerequisite assertions are skipped');
  });
});