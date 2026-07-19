import type { Result } from './result.js';

/**
 * Provider-agnostic LLM client interface (brain variant).
 * Returns plain string — caller handles parsing.
 */
export interface LlmCompletionOptions {
  /** Cancels the logical completion, including any provider process or retry wait. */
  signal?: AbortSignal | undefined;
  /** Maximum time for this logical completion, including provider fallback/retries. */
  timeoutMs?: number | undefined;
}

export interface ILlmClient {
  complete(prompt: string, options?: LlmCompletionOptions): Promise<string>;
}

/**
 * Provider-agnostic LLM client interface (heartbeat variant).
 * Returns Result<string> for explicit error handling.
 */
export interface IResultLlmClient {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}
