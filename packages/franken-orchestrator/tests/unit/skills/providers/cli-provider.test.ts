import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ICliProvider, ProviderOpts } from '../../../../src/skills/providers/cli-provider.js';
import { ProviderRegistry, createDefaultRegistry } from '../../../../src/skills/providers/cli-provider.js';

// ---------------------------------------------------------------------------
// ICliProvider interface shape
// ---------------------------------------------------------------------------
describe('ICliProvider', () => {
  function makeStubProvider(overrides?: Partial<ICliProvider>): ICliProvider {
    return {
      name: 'stub',
      command: 'stub-cli',
      buildArgs: () => ['--arg'],
      normalizeOutput: (raw: string) => raw.trim(),
      estimateTokens: (text: string) => Math.ceil(text.length / 4),
      isRateLimited: (_stderr: string) => false,
      parseRetryAfter: (_stderr: string) => undefined,
      filterEnv: (env: Record<string, string>) => env,
      supportsStreamJson: () => false,
      supportsNativeSessionResume: () => false,
      defaultContextWindowTokens: () => 128_000,
      ...overrides,
    };
  }

  it('has name property (string)', () => {
    const p = makeStubProvider();
    expectTypeOf(p.name).toBeString();
    expect(p.name).toBe('stub');
  });

  it('has command property (string)', () => {
    const p = makeStubProvider();
    expectTypeOf(p.command).toBeString();
    expect(p.command).toBe('stub-cli');
  });

  it('buildArgs returns string array given ProviderOpts', () => {
    const p = makeStubProvider({
      buildArgs: (opts: ProviderOpts) => {
        const args: string[] = ['--prompt', 'hello'];
        if (opts.maxTurns !== undefined) args.push('--max-turns', String(opts.maxTurns));
        if (opts.model) args.push('--model', opts.model);
        return args;
      },
    });
    const args = p.buildArgs({ maxTurns: 10, model: 'opus' });
    expect(args).toEqual(['--prompt', 'hello', '--max-turns', '10', '--model', 'opus']);
  });

  it('normalizeOutput transforms raw string', () => {
    const p = makeStubProvider({
      normalizeOutput: (raw: string) => raw.replace(/\x1b\[[0-9;]*m/g, ''),
    });
    expect(p.normalizeOutput('\x1b[31mhello\x1b[0m')).toBe('hello');
  });

  it('estimateTokens returns a number', () => {
    const p = makeStubProvider();
    const tokens = p.estimateTokens('some output text');
    expectTypeOf(tokens).toBeNumber();
    expect(tokens).toBeGreaterThan(0);
  });

  it('isRateLimited detects rate limiting from stderr', () => {
    const p = makeStubProvider({
      isRateLimited: (stderr: string) => stderr.includes('rate limit'),
    });
    expect(p.isRateLimited('error: rate limit exceeded')).toBe(true);
    expect(p.isRateLimited('normal error')).toBe(false);
  });

  it('parseRetryAfter returns milliseconds or undefined', () => {
    const p = makeStubProvider({
      parseRetryAfter: (stderr: string) => {
        const match = stderr.match(/retry after (\d+)s/);
        return match ? Number(match[1]) * 1000 : undefined;
      },
    });
    expect(p.parseRetryAfter('retry after 30s')).toBe(30_000);
    expect(p.parseRetryAfter('unknown error')).toBeUndefined();
  });

  it('filterEnv returns filtered environment record', () => {
    const p = makeStubProvider({
      filterEnv: (env: Record<string, string>) => {
        const { SECRET, ...rest } = env;
        return rest;
      },
    });
    const filtered = p.filterEnv({ PATH: '/usr/bin', SECRET: 'x' });
    expect(filtered).toEqual({ PATH: '/usr/bin' });
    expect(filtered).not.toHaveProperty('SECRET');
  });

  it('supportsStreamJson returns boolean', () => {
    const p = makeStubProvider({ supportsStreamJson: () => true });
    expect(p.supportsStreamJson()).toBe(true);
  });

  it('supportsNativeSessionResume returns boolean', () => {
    const p = makeStubProvider({ supportsNativeSessionResume: () => true });
    expect(p.supportsNativeSessionResume()).toBe(true);
  });

  it('defaultContextWindowTokens returns a number', () => {
    const p = makeStubProvider({ defaultContextWindowTokens: () => 200_000 });
    expect(p.defaultContextWindowTokens()).toBe(200_000);
  });
});

// ---------------------------------------------------------------------------
// ProviderOpts interface shape
// ---------------------------------------------------------------------------
describe('ProviderOpts', () => {
  it('all properties are optional', () => {
    const empty: ProviderOpts = {};
    expect(empty).toEqual({});
  });

  it('accepts all optional fields', () => {
    const opts: ProviderOpts = {
      maxTurns: 50,
      timeoutMs: 300_000,
      workingDir: '/tmp/project',
      model: 'sonnet',
      extraArgs: ['--verbose'],
      commandOverride: '/usr/local/bin/claude',
    };
    expect(opts.maxTurns).toBe(50);
    expect(opts.timeoutMs).toBe(300_000);
    expect(opts.workingDir).toBe('/tmp/project');
    expect(opts.model).toBe('sonnet');
    expect(opts.extraArgs).toEqual(['--verbose']);
    expect(opts.commandOverride).toBe('/usr/local/bin/claude');
  });
});

// ---------------------------------------------------------------------------
// ProviderRegistry
// ---------------------------------------------------------------------------
describe('ProviderRegistry', () => {
  function makeProvider(name: string): ICliProvider {
    return {
      name,
      command: `${name}-cli`,
      buildArgs: () => [],
      normalizeOutput: (raw: string) => raw,
      estimateTokens: (text: string) => text.length,
      isRateLimited: () => false,
      parseRetryAfter: () => undefined,
      filterEnv: (env: Record<string, string>) => env,
      supportsStreamJson: () => false,
      supportsNativeSessionResume: () => false,
      defaultContextWindowTokens: () => 128_000,
    };
  }

  it('is a class, not a plain Map', () => {
    const registry = new ProviderRegistry();
    expect(registry).toBeInstanceOf(ProviderRegistry);
    expect(registry).not.toBeInstanceOf(Map);
  });

  it('register() adds a provider', () => {
    const registry = new ProviderRegistry();
    const provider = makeProvider('claude');
    registry.register(provider);
    expect(registry.has('claude')).toBe(true);
  });

  it('get() retrieves a registered provider', () => {
    const registry = new ProviderRegistry();
    const provider = makeProvider('claude');
    registry.register(provider);
    expect(registry.get('claude')).toBe(provider);
  });

  it('get() throws on unknown provider with descriptive error listing available names', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('claude'));
    registry.register(makeProvider('codex'));

    expect(() => registry.get('gemini')).toThrowError(/gemini/);
    expect(() => registry.get('gemini')).toThrowError(/claude/);
    expect(() => registry.get('gemini')).toThrowError(/codex/);
  });

  it('get() throws on empty registry with helpful message', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get('claude')).toThrowError(/claude/);
    expect(() => registry.get('claude')).toThrowError(/no providers registered/i);
  });

  it('has() returns false for unregistered provider', () => {
    const registry = new ProviderRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('has() returns true for registered provider', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('claude'));
    expect(registry.has('claude')).toBe(true);
  });

  it('names() returns array of registered provider names', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('claude'));
    registry.register(makeProvider('codex'));
    const names = registry.names();
    expect(names).toEqual(expect.arrayContaining(['claude', 'codex']));
    expect(names).toHaveLength(2);
  });

  it('names() returns empty array when no providers registered', () => {
    const registry = new ProviderRegistry();
    expect(registry.names()).toEqual([]);
  });

  it('register() overwrites existing provider with same name', () => {
    const registry = new ProviderRegistry();
    const v1 = makeProvider('claude');
    const v2 = makeProvider('claude');
    registry.register(v1);
    registry.register(v2);
    expect(registry.get('claude')).toBe(v2);
    expect(registry.names()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createDefaultRegistry
// ---------------------------------------------------------------------------
describe('createDefaultRegistry', () => {
  it('returns a ProviderRegistry instance', () => {
    const registry = createDefaultRegistry();
    expect(registry).toBeInstanceOf(ProviderRegistry);
  });

  it('returns a new instance each call (no shared mutable state)', () => {
    const a = createDefaultRegistry();
    const b = createDefaultRegistry();
    expect(a).not.toBe(b);
  });

  it('has all 4 built-in providers registered in order', () => {
    const registry = createDefaultRegistry();
    expect(registry.names()).toEqual(['claude', 'codex', 'gemini', 'aider']);
  });

  it('each registered provider is the correct class instance', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('claude').command).toBe('claude');
    expect(registry.get('codex').command).toBe('codex');
    expect(registry.get('gemini').command).toBe('gemini');
    expect(registry.get('aider').command).toBe('aider');
  });
});
