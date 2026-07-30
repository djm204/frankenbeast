import { describe, expect, it, vi } from 'vitest';
import { AnthropicApiAdapter } from '../../../src/providers/anthropic-api-adapter.js';
import { ClaudeCliAdapter } from '../../../src/providers/claude-cli-adapter.js';
import { CodexCliAdapter } from '../../../src/providers/codex-cli-adapter.js';
import { GeminiApiAdapter } from '../../../src/providers/gemini-api-adapter.js';
import { GeminiCliAdapter } from '../../../src/providers/gemini-cli-adapter.js';
import { OpenAiApiAdapter } from '../../../src/providers/openai-api-adapter.js';
import { buildProviderConfig, createLlmProvider, resolveWizardExecutionProvider, type ProviderConfig } from '../../../src/providers/provider-config.js';

const request = {
  messages: [],
  systemPrompt: 'test',
};

function optionsOf<TOptions>(adapter: unknown): TOptions {
  return (adapter as { options: TOptions }).options;
}

describe('createLlmProvider', () => {
  it('preserves legacy override fields while building consolidated provider configs', () => {
    expect(buildProviderConfig('gemini', {
      command: '/opt/bin/gemini',
      model: 'gemini-2.5-pro',
      extraArgs: ['--debug', '--yolo'],
    })).toEqual({
      name: 'gemini',
      type: 'gemini-cli',
      cliPath: '/opt/bin/gemini',
      model: 'gemini-2.5-pro',
      extraArgs: ['--debug', '--yolo'],
    });
  });

  it('forwards extraArgs to consolidated CLI adapters', () => {
    const claude = createLlmProvider({
      name: 'claude',
      type: 'claude-cli',
      extraArgs: ['--permission-mode', 'bypassPermissions'],
    });
    const codex = createLlmProvider({
      name: 'codex',
      type: 'codex-cli',
      extraArgs: ['--model', 'o3'],
    });
    const gemini = createLlmProvider({
      name: 'gemini',
      type: 'gemini-cli',
      model: 'gemini-2.5-pro',
      extraArgs: ['--debug'],
    });

    expect(claude).toBeInstanceOf(ClaudeCliAdapter);
    expect((claude as ClaudeCliAdapter).buildArgs(request)).toContain('--permission-mode');
    expect((claude as ClaudeCliAdapter).buildArgs(request)).toContain('bypassPermissions');

    expect(codex).toBeInstanceOf(CodexCliAdapter);
    expect((codex as CodexCliAdapter).buildArgs(request)).toEqual([
      'exec',
      '--sandbox',
      'workspace-write',
      '--json',
      '--ephemeral',
      '-c',
      'instructions=test',
      '--model',
      'o3',
    ]);

    expect(gemini).toBeInstanceOf(GeminiCliAdapter);
    expect((gemini as GeminiCliAdapter).buildArgs(request)).toEqual([
      '-p',
      '',
      '--output-format',
      'stream-json',
      '-m',
      'gemini-2.5-pro',
      '--debug',
    ]);
  });

  it('passes configured models into the Codex CLI adapter', () => {
    const codex = createLlmProvider({
      name: 'codex',
      type: 'codex-cli',
      model: 'o4-mini',
    });

    expect(codex).toBeInstanceOf(CodexCliAdapter);
    expect((codex as CodexCliAdapter).buildArgs(request)).toEqual([
      'exec',
      '--sandbox',
      'workspace-write',
      '--json',
      '--ephemeral',
      '-c',
      'instructions=test',
      '-c',
      'model=o4-mini',
    ]);
  });

  it('passes configured models into the Claude CLI adapter', () => {
    const claude = createLlmProvider({
      name: 'claude',
      type: 'claude-cli',
      model: 'claude-opus-4-1',
      extraArgs: ['--permission-mode', 'bypassPermissions'],
    });

    expect(claude).toBeInstanceOf(ClaudeCliAdapter);
    expect((claude as ClaudeCliAdapter).buildArgs(request)).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--append-system-prompt',
      'test',
      '--model',
      'claude-opus-4-1',
      '--permission-mode',
      'bypassPermissions',
    ]);
  });

  it('passes configured models into API adapters', () => {
    const configs: ProviderConfig[] = [
      { name: 'anthropic', type: 'anthropic-api', model: 'claude-opus-4' },
      { name: 'openai', type: 'openai-api', model: 'gpt-4.1' },
      { name: 'gemini-api', type: 'gemini-api', model: 'gemini-2.5-pro' },
    ];

    const [anthropic, openai, gemini] = configs.map((config) => createLlmProvider(config));

    expect(anthropic).toBeInstanceOf(AnthropicApiAdapter);
    expect(optionsOf<{ model?: string }>(anthropic).model).toBe('claude-opus-4');

    expect(openai).toBeInstanceOf(OpenAiApiAdapter);
    expect(optionsOf<{ model?: string }>(openai).model).toBe('gpt-4.1');

    expect(gemini).toBeInstanceOf(GeminiApiAdapter);
    expect(optionsOf<{ model?: string }>(gemini).model).toBe('gemini-2.5-pro');
  });

  it('passes runtime egress policies and audit sinks into API adapters', () => {
    const egressPolicy = { enabled: true, lanes: {} };
    const egressAudit = vi.fn();
    const anthropic = createLlmProvider(
      { name: 'anthropic', type: 'anthropic-api' },
      { egressPolicy, egressAudit },
    );
    const openai = createLlmProvider(
      { name: 'openai', type: 'openai-api' },
      { egressPolicy, egressAudit },
    );
    const gemini = createLlmProvider(
      { name: 'gemini-api', type: 'gemini-api' },
      { egressPolicy, egressAudit },
    );

    expect(optionsOf<{ egressPolicy?: unknown }>(anthropic).egressPolicy).toBe(egressPolicy);
    expect(optionsOf<{ egressPolicy?: unknown }>(openai).egressPolicy).toBe(egressPolicy);
    expect(optionsOf<{ egressPolicy?: unknown }>(gemini).egressPolicy).toBe(egressPolicy);
    expect(optionsOf<{ egressAudit?: unknown }>(anthropic).egressAudit).toBe(egressAudit);
    expect(optionsOf<{ egressAudit?: unknown }>(openai).egressAudit).toBe(egressAudit);
    expect(optionsOf<{ egressAudit?: unknown }>(gemini).egressAudit).toBe(egressAudit);
  });
});

describe('resolveWizardExecutionProvider', () => {
  // This is the single source of truth for "what CLI will a Beast Wizard-selected
  // provider actually execute as", mirroring the real two-stage launch pipeline: the
  // wizard's own short-alias normalization (mirrored here as WIZARD_PROVIDER_ALIASES),
  // then franken-orchestrator's resolveCliRegistryName (cli/dep-factory.ts) resolution
  // against any configured consolidatedProviders. Every scenario below was, at some
  // point, a real divergence between the Beast Wizard's LLM Targets Model dropdown and
  // what actually launched (#3820, #3888) — this suite pins the correct answer for each.

  it('resolves a recognized short alias with no consolidated providers configured', () => {
    expect(resolveWizardExecutionProvider('openai')).toBe('codex');
    expect(resolveWizardExecutionProvider('anthropic')).toBe('claude');
    expect(resolveWizardExecutionProvider('gemini')).toBe('gemini');
    expect(resolveWizardExecutionProvider('claude')).toBe('claude');
    expect(resolveWizardExecutionProvider('codex')).toBe('codex');
  });

  it('resolves aider unconditionally, independent of any consolidatedProviders entries', () => {
    expect(resolveWizardExecutionProvider('aider')).toBe('aider');
    expect(resolveWizardExecutionProvider('aider', [{ name: 'aider', type: 'claude-cli' }])).toBe('aider');
  });

  it('resolves an unrecognized custom-named consolidated provider via its configured type', () => {
    // e.g. an operator running two Claude accounts as 'prod-claude'/'dev-claude'.
    expect(
      resolveWizardExecutionProvider('prod-claude', [{ name: 'prod-claude', type: 'claude-cli' }]),
    ).toBe('claude');
  });

  it('prefers a matching consolidated provider entry\'s own type over a coincidental name alias', () => {
    // The exact #3888 counterexample: a consolidated provider named after a recognized
    // short alias ('claude') but configured with a *different* type ('codex-cli') must
    // resolve as Codex, not Claude — matching resolveCliRegistryName finding the
    // consolidated entry by name and using its type, which always wins.
    expect(
      resolveWizardExecutionProvider('claude', [{ name: 'claude', type: 'codex-cli' }]),
    ).toBe('codex');
  });

  it('still resolves a recognized alias when no consolidated entry overrides it', () => {
    expect(resolveWizardExecutionProvider('claude', [{ name: 'prod-claude', type: 'gemini-cli' }])).toBe('claude');
  });

  it('returns undefined for a provider identity that resolves to no known CLI', () => {
    expect(resolveWizardExecutionProvider('totally-unknown-provider')).toBeUndefined();
  });

  it('trims the provider name before aliasing/lookup, matching normalizeWizardProvider', () => {
    // ProviderConfigSchema currently accepts a `name` with surrounding whitespace, but the
    // real wizard pipeline trims the selected name before submission
    // (normalizeWizardProvider). Without trimming here too, a consolidated entry configured
    // with padded whitespace in its name would only match this untrimmed lookup, diverging
    // from what the trimmed submission actually resolves to at launch (#3888).
    expect(
      resolveWizardExecutionProvider(' codex ', [{ name: ' codex ', type: 'claude-cli' }]),
    ).toBe('codex');
    expect(resolveWizardExecutionProvider('  claude  ')).toBe('claude');
    expect(resolveWizardExecutionProvider('   ')).toBeUndefined();
  });
});