import type { ILlmClient } from '@franken/core';
import { Spinner } from '../cli/spinner.js';

export interface ProgressLlmClientOptions {
  label?: string;
  silent?: boolean;
  write?: (text: string) => void;
}

export class ProgressLlmClient implements ILlmClient {
  private readonly inner: ILlmClient;
  private readonly label: string;
  private readonly silent: boolean;
  private readonly write: (text: string) => void;

  constructor(inner: ILlmClient, options: ProgressLlmClientOptions = {}) {
    this.inner = inner;
    this.label = options.label ?? 'Thinking...';
    this.silent = options.silent ?? false;
    this.write = options.write ?? ((text: string) => process.stderr.write(text));
  }

  async complete(prompt: string): Promise<string> {
    const spinner = new Spinner({
      silent: this.silent,
      write: (text: string) => {
        try {
          this.write(text);
        } catch {
          // Progress output must never break the LLM call path.
        }
      },
    });

    spinner.start(this.label);

    try {
      const result = await this.inner.complete(prompt);
      const elapsedSeconds = (spinner.elapsed() / 1000).toFixed(1);
      const tokenCount = estimateTokens(result);

      spinner.stop(`  Done (${elapsedSeconds}s, ~${tokenCount} tokens)`);
      return result;
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }
}

function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.3);
}
