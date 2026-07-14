import { describe, it, expect } from 'vitest';
import {
  MAX_TIMEOUT_MS,
  defaultConfig,
  normalizeGovernorConfig,
  validateGovernorConfig,
} from '../../../src/core/config.js';
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

  it('normalizes valid overrides over defaults', () => {
    const config = normalizeGovernorConfig({
      timeoutMs: 12_345,
      sessionTokenTtlMs: 67_890,
      operatorName: 'alice',
    });

    expect(config).toMatchObject({
      timeoutMs: 12_345,
      sessionTokenTtlMs: 67_890,
      operatorName: 'alice',
      requireSignedApprovals: false,
    });
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects invalid %s timeoutMs overrides', (_name: string, timeoutMs: number) => {
    expect(() => normalizeGovernorConfig({ timeoutMs })).toThrow(
      'timeoutMs must be a positive finite number',
    );
  });

  it('rejects timeoutMs overrides above the Node timer limit', () => {
    expect(() => normalizeGovernorConfig({ timeoutMs: MAX_TIMEOUT_MS + 1 })).toThrow(
      `timeoutMs must be less than or equal to ${MAX_TIMEOUT_MS}`,
    );
  });

  it('accepts timeoutMs overrides at the Node timer limit', () => {
    expect(normalizeGovernorConfig({ timeoutMs: MAX_TIMEOUT_MS }).timeoutMs).toBe(MAX_TIMEOUT_MS);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects invalid %s sessionTokenTtlMs overrides', (_name: string, sessionTokenTtlMs: number) => {
    expect(() => normalizeGovernorConfig({ sessionTokenTtlMs })).toThrow(
      'sessionTokenTtlMs must be a positive finite number',
    );
  });

  it('validates direct GovernorConfig values', () => {
    const config: GovernorConfig = { ...defaultConfig(), timeoutMs: 1, sessionTokenTtlMs: 1 };

    expect(validateGovernorConfig(config)).toBe(config);
  });
});
