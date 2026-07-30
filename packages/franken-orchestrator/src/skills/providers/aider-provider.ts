/**
 * Aider CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Aider uses LiteLLM which handles rate-limit retries internally,
 * so isRateLimited() always returns false.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { sanitizeRunConfigIntegrityEnv } from '../../cli/run-config-integrity.js';

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export class AiderProvider implements ICliProvider {
  readonly name = 'aider';
  readonly command = 'aider';
  readonly chatModel = 'sonnet';

  buildArgs(opts: ProviderOpts): string[] {
    const args: string[] = ['--message', '--yes-always', '--no-stream', '--no-auto-commits'];
    if (opts.model) {
      args.push('--model', opts.model);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    return raw.replace(ANSI_PATTERN, '');
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  isRateLimited(_stderr: string): boolean {
    return false;
  }

  parseRetryAfter(_stderr: string): number | undefined {
    return undefined;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = sanitizeRunConfigIntegrityEnv(env);
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('AIDER')) {
        delete filtered[key];
      }
    }
    return filtered;
  }

  /**
   * Aider has no fixed backend — its default chat model is Claude Sonnet,
   * but `--model` (and `providerOverrides.aider.model`) accepts any
   * LiteLLM-supported model string, each with its own vendor API key. This
   * can't be fully exhaustive (LiteLLM supports dozens of providers), but
   * covers the common ones so overriding aider's model doesn't silently
   * break auth. Extend this list if another backend is configured.
   */
  requiredAuthEnvVars(): readonly string[] {
    return [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'AZURE_API_KEY',
      'GEMINI_API_KEY',
      'GROQ_API_KEY',
      'MISTRAL_API_KEY',
      'OPENROUTER_API_KEY',
      'DEEPSEEK_API_KEY',
      'TOGETHER_API_KEY',
      'COHERE_API_KEY',
      'XAI_API_KEY',
      'PERPLEXITY_API_KEY',
      'FIREWORKS_API_KEY',
    ];
  }

  supportsStreamJson(): boolean {
    return false;
  }

  supportsNativeSessionResume(): boolean {
    return false;
  }

  defaultContextWindowTokens(): number {
    return 128_000;
  }

  getCacheCapabilities() {
    return {
      nativeWorkSessions: false,
      persistentAcrossProcesses: false,
      promptReuse: 'managed' as const,
    };
  }
}
