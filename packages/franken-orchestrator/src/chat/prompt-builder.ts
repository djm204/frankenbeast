import type { TranscriptMessage } from './types.js';

export interface PromptBuilderOptions {
  projectName: string;
  maxMessages?: number;
}

export class PromptBuilder {
  private readonly projectName: string;
  private readonly maxMessages: number;

  constructor({ projectName, maxMessages = 100 }: PromptBuilderOptions) {
    this.projectName = projectName;
    this.maxMessages = maxMessages;
  }

  build(messages: TranscriptMessage[]): string {
    const systemContext = `You are an AI assistant for project ${this.projectName}. You help with code, architecture, and repo management.`;
    const truncated = messages.slice(-this.maxMessages);
    const history = truncated
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    if (history) {
      return `${systemContext}\n\n${history}`;
    }
    return systemContext;
  }
}
