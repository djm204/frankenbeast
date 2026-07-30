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

/**
 * All vendor keys aider can plausibly need across LiteLLM-supported
 * backends, used as a fallback when the active model string doesn't match a
 * known prefix (unrecognized backend, or no model configured at all). This
 * can't be fully exhaustive — LiteLLM supports dozens of providers — but
 * covers the common ones. Extend if another backend is configured.
 */
const ALL_KNOWN_VENDOR_AUTH_ENV_VARS: readonly string[] = [
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
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
];

/**
 * Maps a LiteLLM model-string prefix (`<provider>/<model>`, per LiteLLM's
 * own convention) to the vendor env var(s) it needs. Bare model names with
 * no `provider/` prefix are OpenAI's convention (`gpt-4o`, `o1-mini`, ...).
 * Bedrock/SageMaker authenticate via the standard AWS credential trio
 * (access key + secret + optional session token for temporary credentials),
 * not a single API key.
 */
const LITELLM_PREFIX_AUTH_ENV_VARS: ReadonlyArray<readonly [prefix: string, envVars: readonly string[]]> = [
  ['anthropic/', ['ANTHROPIC_API_KEY']],
  ['claude', ['ANTHROPIC_API_KEY']],
  // Bare Claude model-family shorthand — this class's own default
  // `chatModel` is the literal string 'sonnet' (see below), which reaches
  // requiredAuthEnvVars() as-is when no explicit model is configured, so it
  // must resolve to Anthropic rather than falling through to the full
  // multi-vendor list.
  ['sonnet', ['ANTHROPIC_API_KEY']],
  ['opus', ['ANTHROPIC_API_KEY']],
  ['haiku', ['ANTHROPIC_API_KEY']],
  ['openai/', ['OPENAI_API_KEY']],
  ['gpt-', ['OPENAI_API_KEY']],
  ['o1', ['OPENAI_API_KEY']],
  ['o3', ['OPENAI_API_KEY']],
  ['azure/', ['AZURE_API_KEY']],
  ['gemini/', ['GEMINI_API_KEY']],
  ['vertex_ai/', ['GEMINI_API_KEY']],
  ['groq/', ['GROQ_API_KEY']],
  ['mistral/', ['MISTRAL_API_KEY']],
  ['openrouter/', ['OPENROUTER_API_KEY']],
  ['deepseek/', ['DEEPSEEK_API_KEY']],
  ['together_ai/', ['TOGETHER_API_KEY']],
  ['together/', ['TOGETHER_API_KEY']],
  ['cohere/', ['COHERE_API_KEY']],
  ['cohere_chat/', ['COHERE_API_KEY']],
  ['xai/', ['XAI_API_KEY']],
  ['perplexity/', ['PERPLEXITY_API_KEY']],
  ['fireworks_ai/', ['FIREWORKS_API_KEY']],
  ['fireworks/', ['FIREWORKS_API_KEY']],
  ['bedrock/', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']],
  ['sagemaker/', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']],
];

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
   * LiteLLM-supported model string, each with its own vendor API key.
   * Resolve only the *active* backend's key from the model string when it
   * matches a known LiteLLM prefix, so an aider invocation on one backend
   * doesn't also receive every other configured vendor's credentials. Falls
   * back to the full known-vendor list when the model is unset or doesn't
   * match a recognized prefix, favoring a working (if slightly
   * over-permissive) invocation over a silently broken one.
   */
  requiredAuthEnvVars(model?: string): readonly string[] {
    const resolved = (model ?? this.chatModel ?? '').toLowerCase();
    for (const [prefix, envVars] of LITELLM_PREFIX_AUTH_ENV_VARS) {
      if (resolved.startsWith(prefix)) {
        return envVars;
      }
    }
    return ALL_KNOWN_VENDOR_AUTH_ENV_VARS;
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
