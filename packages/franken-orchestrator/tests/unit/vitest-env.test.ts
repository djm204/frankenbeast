import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readVitestFlag } from '../../../../scripts/vitest-env.js';

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
    expect(config).toContain("'test/e2e/**/*.test.ts'");
  });
});
