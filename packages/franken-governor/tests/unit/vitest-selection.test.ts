import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const unitConfigPath = fileURLToPath(new URL('../../vitest.config.ts', import.meta.url));
const integrationConfigPath = fileURLToPath(
  new URL('../../vitest.integration.config.ts', import.meta.url),
);
const integrationTestPath = fileURLToPath(
  new URL('../integration/full-approval-flow.test.ts', import.meta.url),
);

describe('governor Vitest suite selection', () => {
  it('keeps default and coverage runs scoped to unit tests', () => {
    const unitConfig = readFileSync(unitConfigPath, 'utf8');

    expect(unitConfig).toContain("['tests/unit/**/*.test.ts']");
    expect(unitConfig).toContain("exclude: isIntegration ? [] : ['tests/integration/**/*.test.ts', 'tests/**/*.integration.test.ts']");
  });

  it('exposes a dedicated integration test script, config, and suite', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const integrationConfig = readFileSync(integrationConfigPath, 'utf8');

    expect(pkg.scripts['test:integration']).toBe(
      'INTEGRATION=true vitest run --config vitest.integration.config.ts',
    );
    expect(integrationConfig).toContain("include: ['tests/integration/**/*.test.ts']");
    expect(existsSync(integrationTestPath)).toBe(true);
  });
});
