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

    expect(unitConfig).toContain("include: ['tests/unit/**/*.test.ts']");
    expect(unitConfig).toContain("exclude: ['tests/integration/**/*.test.ts', 'tests/**/*.integration.test.ts']");
    expect(unitConfig).not.toContain('INTEGRATION');
  });

  it('exposes a dedicated integration-only test script, config, and suite', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const integrationConfig = readFileSync(integrationConfigPath, 'utf8');

    expect(pkg.scripts['test:integration']).toBe(
      'vitest run --config vitest.integration.config.ts',
    );
    expect(pkg.scripts['test:integration']).not.toContain('INTEGRATION=true');
    expect(integrationConfig).toContain("include: ['tests/integration/**/*.test.ts']");
    expect(existsSync(integrationTestPath)).toBe(true);
  });
});
