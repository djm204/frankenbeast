import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readVitestFlag, readVitestFlags } from '../scripts/vitest-env.js';

const ROOT = resolve(import.meta.dirname, '..');

describe('Vitest environment flag helper', () => {
  it('treats missing and explicit false-like values as disabled', () => {
    expect(readVitestFlag({}, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: '' }, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: 'false' }, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: '0' }, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: 'off' }, 'INTEGRATION')).toBe(false);
  });

  it('accepts only sanitized true-like values as enabled', () => {
    expect(readVitestFlag({ EVAL: 'true' }, 'EVAL')).toBe(true);
    expect(readVitestFlag({ EVAL: '1' }, 'EVAL')).toBe(true);
    expect(readVitestFlag({ EVAL: ' yes ' }, 'EVAL')).toBe(true);
    expect(readVitestFlag({ EVAL: 'ON' }, 'EVAL')).toBe(true);
  });

  it('rejects unexpected values without echoing the raw input', () => {
    expect(() => readVitestFlag({ E2E: 'secret-token-value' }, 'E2E')).toThrow(
      /E2E must be one of true, false, 1, 0, yes, no, on, or off/u,
    );
    expect(() => readVitestFlag({ E2E: 'secret-token-value' }, 'E2E')).not.toThrow(
      /secret-token-value/u,
    );
  });

  it('validates only the flags requested by a config', () => {
    expect(readVitestFlags(['INTEGRATION'], { INTEGRATION: 'true', E2E: 'secret-token-value' })).toEqual({
      INTEGRATION: true,
    });
  });

  it('keeps root integration and e2e suites opt-in for the default root CI command', () => {
    const config = readFileSync(resolve(ROOT, 'vitest.config.ts'), 'utf-8');

    expect(config).toContain("readVitestFlags(['INTEGRATION', 'E2E', 'DOCKER_BUILD'])");
    expect(config).toContain('optionsWithRequiredValue');
    expect(config).toContain('collectRequestedPaths');
    expect(config).toContain("normalizeRequestedPath");
    expect(config).toContain("arg === 'tests/integration'");
    expect(config).toContain("arg.startsWith('tests/integration/')");
    expect(config).toContain("'tests/sandbox-dockerfile.test.ts'");
    expect(config).toContain('runDockerBuild');
    expect(config).toContain("'tests/**/*.test.ts'");
    expect(config).toContain("'tests/integration/**/*.test.ts'");
    expect(config).toContain('optionalSuiteRequested');
    expect(config).toContain('runIntegration && !runE2e');
    expect(config).not.toContain("...(!runDockerBuild ? ['tests/sandbox-dockerfile.test.ts'] : [])");
    expect(config).toContain('include,');
    expect(config).toContain('exclude,');
  });
});
