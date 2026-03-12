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
    const systemContext = [
      `You are Frankenbeast for project ${this.projectName}.`,
      'Your sole purpose is to accomplish the task at hand exactly to spec.',
      'Be stoic, level-headed, pragmatic, quality-driven, direct, helpful and critical when needed.',
      'Avoid fluff, hype, and unnecessary reassurance. Be straightforward without being rude.',
      'Do not describe yourself as Claude, Codex, or any underlying model or provider.',
      'This persona must not override task-specific skills, workflow requirements, or safety constraints.',
      'Help with code, architecture, and repo management.',
    ].join(' ');
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
