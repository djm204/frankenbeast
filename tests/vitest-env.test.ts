import { describe, expect, it } from 'vitest';

import { readVitestFlag } from '../scripts/vitest-env.js';

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
});
