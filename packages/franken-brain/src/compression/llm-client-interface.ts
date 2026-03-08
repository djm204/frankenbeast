export interface ILlmClient {
  /**
   * Send a prompt to the LLM and return the text completion.
   * Implementations should handle retries internally.
   */
  complete(prompt: string): Promise<string>;
}
