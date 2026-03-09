import type { ITaskExecutor, ExecutionResult } from './turn-runner.js';

export interface ChatAgentLlm {
  complete(prompt: string): Promise<string>;
}

export interface ChatAgentExecutorOptions {
  llm: ChatAgentLlm;
  onProgress?: (message: string) => void;
}

export class ChatAgentExecutor implements ITaskExecutor {
  private readonly llm: ChatAgentLlm;
  private readonly onProgress: ((message: string) => void) | undefined;

  constructor(opts: ChatAgentExecutorOptions) {
    this.llm = opts.llm;
    this.onProgress = opts.onProgress;
  }

  async execute(input: { userInput: string }): Promise<ExecutionResult> {
    this.onProgress?.('Spawning agent...');

    try {
      const response = await this.llm.complete(input.userInput);
      return {
        status: 'success',
        summary: response,
        filesChanged: [],
        testsRun: 0,
        errors: [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        summary: `Agent failed: ${message}`,
        filesChanged: [],
        testsRun: 0,
        errors: [message],
      };
    }
  }
}
