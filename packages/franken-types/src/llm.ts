import type { Result } from './result.js';
import type { TokenUsage } from './provider.js';
import type { ProviderContext } from './api-contracts.js';

/**
 * Provider-agnostic LLM client interface (brain variant).
 * Returns plain string — caller handles parsing.
 */
export interface LlmCompletionOptions {
  /** Cancels the logical completion, including any provider process or retry wait. */
  signal?: AbortSignal | undefined;
  /** Maximum time for this logical completion, including provider fallback/retries. */
  timeoutMs?: number | undefined;
  /**
   * First-party runtime metadata (e.g. provider/fallback status) to deliver
   * through a genuine system-level channel when the underlying CLI supports
   * one, rather than concatenating it onto the user-turn prompt text — where
   * it is textually indistinguishable from injected content and gets
   * (correctly) distrusted by safety-conscious models. Providers without an
   * equivalent channel fall back to appending it to the prompt.
   */
  systemPromptAddendum?: string | undefined;
}

export interface LlmCompletionResult {
  text: string;
  /** Present only when the underlying provider reported real token usage. */
  usage?: TokenUsage;
  /** The CLI provider/model that actually served this completion, and any fallback that occurred. */
  providerContext?: ProviderContext;
}

export interface ILlmClient {
  complete(prompt: string, options?: LlmCompletionOptions): Promise<string>;
  /**
   * Same completion as `complete()`, but surfaces real token usage when the
   * underlying provider reports it. Optional so every existing `ILlmClient`
   * implementation keeps working unchanged; callers that want usage data
   * should feature-detect with `typeof client.completeWithUsage === 'function'`.
   */
  completeWithUsage?(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult>;
}

/**
 * Provider-agnostic LLM client interface (heartbeat variant).
 * Returns Result<string> for explicit error handling.
 */
export interface IResultLlmClient {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}
