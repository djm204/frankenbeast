import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../../../src/core/config.js';
import type { GovernorConfig } from '../../../src/core/config.js';

describe('GovernorConfig', () => {
  it('defaultConfig returns an object with timeoutMs > 0', () => {
    const config = defaultConfig();
    expect(config.timeoutMs).toBeGreaterThan(0);
  });

  it('defaultConfig has requireSignedApprovals false by default', () => {
    const config = defaultConfig();
    expect(config.requireSignedApprovals).toBe(false);
  });

  it('defaultConfig has a non-empty operatorName', () => {
    const config = defaultConfig();
    expect(config.operatorName.length).toBeGreaterThan(0);
  });

  it('defaultConfig has sessionTokenTtlMs > 0', () => {
    const config = defaultConfig();
    expect(config.sessionTokenTtlMs).toBeGreaterThan(0);
  });
});
