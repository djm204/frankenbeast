import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { readVitestFlag } from '../../../../scripts/vitest-env.js';

type VitestConfig = {
  test?: {
    include?: string[];
    exclude?: string[];
    passWithNoTests?: boolean;
  };
};

async function loadPackageVitestConfig(
  env: Record<string, string | undefined>,
  argv: string[] = ['node', 'vitest', 'run'],
): Promise<VitestConfig> {
  const originalArgv = process.argv;
  const originalEnv = {
    E2E: process.env['E2E'],
    INTEGRATION: process.env['INTEGRATION'],
  };

  try {
    vi.resetModules();
    process.argv = argv;

    for (const name of ['E2E', 'INTEGRATION'] as const) {
      const value = env[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    const module = await import('../../vitest.config.ts');
    return module.default as VitestConfig;
  } finally {
    process.argv = originalArgv;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    vi.resetModules();
  }
}

function listTestFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? listTestFiles(path) : [path];
    })
    .filter((path) => path.endsWith('.test.ts'));
}

describe('Vitest environment flags', () => {
  it('treats missing and explicit false-like values as disabled', () => {
    expect(readVitestFlag({}, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: '' }, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: 'false' }, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: '0' }, 'INTEGRATION')).toBe(false);
    expect(readVitestFlag({ INTEGRATION: 'off' }, 'INTEGRATION')).toBe(false);
  });

  it('accepts only sanitized true-like values as enabled', () => {
    expect(readVitestFlag({ E2E: 'true' }, 'E2E')).toBe(true);
    expect(readVitestFlag({ E2E: '1' }, 'E2E')).toBe(true);
    expect(readVitestFlag({ E2E: ' yes ' }, 'E2E')).toBe(true);
    expect(readVitestFlag({ E2E: 'ON' }, 'E2E')).toBe(true);
  });

  it('rejects unexpected values without echoing raw environment contents', () => {
    const unexpectedValue = 'invalid-redacted-vitest-flag-value';

    expect(() => readVitestFlag({ E2E: unexpectedValue }, 'E2E')).toThrow(
      /E2E must be one of true, false, 1, 0, yes, no, on, or off/u,
    );
    expect(() => readVitestFlag({ E2E: unexpectedValue }, 'E2E')).not.toThrow(unexpectedValue);
  });

  it('keeps direct process environment reads out of the Vitest config', () => {
    const config = readFileSync(resolve(import.meta.dirname, '../../vitest.config.ts'), 'utf8');

    expect(config).not.toContain('process.env');
    expect(config).toContain("arg.includes('tests/e2e/')");
    expect(config).toContain("arg.includes('test/e2e/')");
    expect(config).toContain("'tests/e2e/**/*.test.ts'");
    expect(config).toContain("'test/e2e/**/*.test.ts'");
    expect(config).toContain('passWithNoTests: false');
  });

  it('fails instead of passing when no E2E tests are discovered', async () => {
    const config = await loadPackageVitestConfig({ E2E: 'true' });

    expect(config.test?.passWithNoTests).toBe(false);
  });

  it('treats false-like suite flags as default unit test selection', async () => {
    for (const env of [{ E2E: 'false' }, { E2E: '0' }, { INTEGRATION: 'false' }]) {
      const config = await loadPackageVitestConfig(env);

      expect(config.test?.include).toEqual(['tests/unit/**/*.test.ts', 'test/**/*.test.ts']);
      expect(config.test?.exclude).toContain('tests/integration/**/*.test.ts');
      expect(config.test?.exclude).toContain('tests/e2e/**/*.test.ts');
      expect(config.test?.exclude).toContain('test/e2e/**/*.test.ts');
    }
  });

  it('uses strict E2E parsing in direct-path E2E guards', () => {
    const packageRoot = resolve(import.meta.dirname, '../..');
    const directE2eGuards = [
      'tests/e2e/cli-skill-execution.test.ts',
      'tests/e2e/chunk-pipeline.test.ts',
      'tests/e2e/cli-e2e.test.ts',
      'test/e2e/e2e-pipeline.test.ts',
    ].map((file) => readFileSync(resolve(packageRoot, file), 'utf8'));

    for (const guard of directE2eGuards) {
      expect(guard).toContain("readVitestFlag(process.env, 'E2E')");
      expect(guard).not.toContain("!process.env['E2E']");
      expect(guard).not.toContain("process.env['E2E'] === 'true'");
    }
  });

  it('keeps every package E2E test tree covered by the E2E include globs', () => {
    const packageRoot = resolve(import.meta.dirname, '../..');
    const config = readFileSync(resolve(packageRoot, 'vitest.config.ts'), 'utf8');
    const e2eTestFiles = ['tests/e2e', 'test/e2e'].flatMap((dir) =>
      listTestFiles(resolve(packageRoot, dir)).map((file) => relative(packageRoot, file)),
    );

    expect(e2eTestFiles).toContain('test/e2e/e2e-pipeline.test.ts');
    for (const file of e2eTestFiles) {
      const e2eRoot = file.startsWith('tests/e2e/') ? 'tests/e2e' : 'test/e2e';
      expect(config).toContain(`'${e2eRoot}/**/*.test.ts'`);
    }
  });
});
