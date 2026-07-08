import { describe, expect, it } from 'vitest';
import { AnthropicApiAdapter } from '../../../src/providers/anthropic-api-adapter.js';
import { ClaudeCliAdapter } from '../../../src/providers/claude-cli-adapter.js';
import { CodexCliAdapter } from '../../../src/providers/codex-cli-adapter.js';
import { GeminiApiAdapter } from '../../../src/providers/gemini-api-adapter.js';
import { GeminiCliAdapter } from '../../../src/providers/gemini-cli-adapter.js';
import { OpenAiApiAdapter } from '../../../src/providers/openai-api-adapter.js';
import { buildProviderConfig, createLlmProvider, type ProviderConfig } from '../../../src/providers/provider-config.js';

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

    const [anthropic, openai, gemini] = configs.map(createLlmProvider);

    expect(anthropic).toBeInstanceOf(AnthropicApiAdapter);
    expect(optionsOf<{ model?: string }>(anthropic).model).toBe('claude-opus-4');

    expect(openai).toBeInstanceOf(OpenAiApiAdapter);
    expect(optionsOf<{ model?: string }>(openai).model).toBe('gpt-4.1');

    expect(gemini).toBeInstanceOf(GeminiApiAdapter);
    expect(optionsOf<{ model?: string }>(gemini).model).toBe('gemini-2.5-pro');
  });
});