import { afterEach, describe, expect, it } from 'vitest';

import { testCredential } from '../../support/test-credentials.js';

const ENV_NAME = 'TEST_BLANK_CREDENTIAL_FALLBACK';

describe('testCredential', () => {
  afterEach(() => {
    delete process.env[ENV_NAME];
  });

  it('treats blank configured values as unset', () => {
    process.env[ENV_NAME] = '   ';

    expect(testCredential(ENV_NAME)).toBe('test-test-blank-credential-fallback');
  });

  it('uses trimmed configured values when present', () => {
    process.env[ENV_NAME] = ' configured-placeholder ';

    expect(testCredential(ENV_NAME)).toBe('configured-placeholder');
  });
});
