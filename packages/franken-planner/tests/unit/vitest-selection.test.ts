import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const unitConfigPath = fileURLToPath(new URL('../../vitest.config.ts', import.meta.url));
const integrationConfigPath = fileURLToPath(
  new URL('../../vitest.integration.config.ts', import.meta.url)
);

describe('planner Vitest suite selection', () => {
  it('keeps default and coverage runs scoped to unit tests', () => {
    const unitConfig = readFileSync(unitConfigPath, 'utf8');

    expect(unitConfig).toContain("include: ['tests/unit/**/*.test.ts']");
    expect(unitConfig).toContain("exclude: ['tests/integration/**/*.integration.test.ts']");
    expect(unitConfig).not.toContain("include: ['tests/**/*.test.ts']");
  });

  it('exposes a dedicated integration test script and config', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const integrationConfig = readFileSync(integrationConfigPath, 'utf8');

    expect(pkg.scripts['test:integration']).toBe(
      'vitest run --config vitest.integration.config.ts'
    );
    expect(integrationConfig).toContain("include: ['tests/integration/**/*.integration.test.ts']");
  });
});
