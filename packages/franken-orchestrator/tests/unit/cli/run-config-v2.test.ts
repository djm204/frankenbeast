import { describe, it, expect } from 'vitest';
import {
  RunConfigV2Schema,
  parseRunConfig,
  mergeCliArgs,
} from '../../../src/cli/run-config-v2.js';

describe('RunConfigV2Schema', () => {
  it('validates minimal config (empty object)', () => {
    expect(parseRunConfig({})).toEqual({});
  });

  it('validates full config with all fields', () => {
    const config = {
      runId: 'run-1',
      provider: 'claude',
      providers: [
        { name: 'claude', type: 'claude-cli' },
        { name: 'openai', type: 'openai-api', apiKey: 'sk-test' },
      ],
      objective: 'Fix auth bug',
      model: 'claude-sonnet-4-6',
      maxDurationMs: 600000,
      maxTotalTokens: 100000,
      maxTokens: 4096,
      skills: ['github', 'linear'],
      skillsDir: './custom-skills',
      security: {
        profile: 'standard',
        piiMasking: false,
      },
      critique: {
        evaluators: ['lint', 'test-pass', 'reflection'],
      },
      reflection: true,
      brain: {
        dbPath: '/tmp/brain.db',
      },
    };
    expect(parseRunConfig(config)).toEqual(config);
  });

  it('rejects invalid provider type', () => {
    expect(() =>
      parseRunConfig({
        providers: [{ name: 'bad', type: 'nonexistent' }],
      }),
    ).toThrow();
  });

  it('rejects invalid security profile', () => {
    expect(() =>
      parseRunConfig({ security: { profile: 'ultra' } }),
    ).toThrow();
  });

  it('allows passthrough of unknown fields', () => {
    const config = parseRunConfig({ customField: 'value' });
    expect((config as Record<string, unknown>)['customField']).toBe('value');
  });
});

describe('mergeCliArgs', () => {
  it('CLI args override file config', () => {
    const fileConfig = parseRunConfig({
      provider: 'claude',
      maxTokens: 2048,
    });
    const merged = mergeCliArgs(fileConfig, {
      maxTokens: 8192,
    });
    expect(merged.maxTokens).toBe(8192);
    expect(merged.provider).toBe('claude'); // unchanged
  });

  it('does not override with undefined', () => {
    const fileConfig = parseRunConfig({ provider: 'claude' });
    const merged = mergeCliArgs(fileConfig, { provider: undefined });
    expect(merged.provider).toBe('claude');
  });

  it('deep merges nested config objects', () => {
    const fileConfig = parseRunConfig({
      security: { profile: 'strict', allowedDomains: ['github.com'] },
    });
    const merged = mergeCliArgs(fileConfig, {
      security: { piiMasking: false },
    } as Partial<typeof fileConfig>);
    // piiMasking overridden, but profile and allowedDomains preserved
    expect(merged.security?.piiMasking).toBe(false);
    expect(merged.security?.profile).toBe('strict');
    expect(merged.security?.allowedDomains).toEqual(['github.com']);
  });

  it('arrays are replaced, not merged', () => {
    const fileConfig = parseRunConfig({
      skills: ['github', 'linear'],
    });
    const merged = mergeCliArgs(fileConfig, {
      skills: ['custom-tool'],
    });
    expect(merged.skills).toEqual(['custom-tool']);
  });
});
