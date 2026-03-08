import { describe, it, expect } from 'vitest';
import { OrchestratorConfigSchema } from '../../../src/config/orchestrator-config.js';

describe('OrchestratorConfigSchema providers section', () => {
  it('produces sensible defaults when parsed with empty object', () => {
    const config = OrchestratorConfigSchema.parse({});
    expect(config.providers).toBeDefined();
    expect(config.providers.default).toBe('claude');
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
    expect(config.providers.overrides).toEqual({});
  });

  it('accepts custom default provider', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { default: 'gemini' },
    });
    expect(config.providers.default).toBe('gemini');
    // Other defaults still apply
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
    expect(config.providers.overrides).toEqual({});
  });

  it('accepts custom fallback chain', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { fallbackChain: ['gemini', 'aider', 'claude'] },
    });
    expect(config.providers.fallbackChain).toEqual(['gemini', 'aider', 'claude']);
  });

  it('accepts overrides with command, model, and extraArgs', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: {
        overrides: {
          gemini: {
            command: '/usr/local/bin/gemini-cli',
            model: 'gemini-pro',
            extraArgs: ['--temperature', '0.5'],
          },
        },
      },
    });
    const gemini = config.providers.overrides['gemini'];
    expect(gemini).toBeDefined();
    expect(gemini!.command).toBe('/usr/local/bin/gemini-cli');
    expect(gemini!.model).toBe('gemini-pro');
    expect(gemini!.extraArgs).toEqual(['--temperature', '0.5']);
  });

  it('accepts overrides with partial fields (all optional)', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: {
        overrides: {
          aider: { model: 'gpt-4o' },
        },
      },
    });
    const aider = config.providers.overrides['aider'];
    expect(aider).toBeDefined();
    expect(aider!.model).toBe('gpt-4o');
    expect(aider!.command).toBeUndefined();
    expect(aider!.extraArgs).toBeUndefined();
  });

  it('accepts empty overrides object', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { overrides: {} },
    });
    expect(config.providers.overrides).toEqual({});
  });

  it('preserves existing config fields alongside providers', () => {
    const config = OrchestratorConfigSchema.parse({
      maxCritiqueIterations: 5,
      providers: { default: 'codex' },
    });
    expect(config.maxCritiqueIterations).toBe(5);
    expect(config.providers.default).toBe('codex');
  });
});
