import type { Result } from './result.js';
/**
 * Provider-agnostic LLM client interface (brain variant).
 * Returns plain string — caller handles parsing.
 */
export interface ILlmClient {
    complete(prompt: string): Promise<string>;
}
/**
 * Provider-agnostic LLM client interface (heartbeat variant).
 * Returns Result<string> for explicit error handling.
 */
export interface IResultLlmClient {
    complete(prompt: string, options?: {
        maxTokens?: number;
    }): Promise<Result<string>>;
}
//# sourceMappingURL=llm.d.ts.map