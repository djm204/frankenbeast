import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readVitestFlag } from '../../../../scripts/vitest-env.js';

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
