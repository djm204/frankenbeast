import type { ILlmClient } from '@franken/types';
import type { TranscriptMessage } from './types.js';

export interface TranscriptPolicyOptions {
  maxMessages: number;
}

const SAFETY_KEYWORDS = [
  'approval',
  'approved',
  'delete',
  'error',
  'files changed',
  'pending',
  'rejected',
  'destructive',
];

export class TranscriptPolicy {
  private readonly llm: ILlmClient;
  private readonly maxMessages: number;

  constructor(llm: ILlmClient, opts: TranscriptPolicyOptions) {
    this.llm = llm;
    this.maxMessages = opts.maxMessages;
  }

  async enforce(messages: TranscriptMessage[]): Promise<TranscriptMessage[]> {
    if (messages.length <= this.maxMessages) {
      return messages;
    }

    const keepCount = this.maxMessages;
    const toSummarize = messages.slice(0, messages.length - keepCount);
    const kept = messages.slice(messages.length - keepCount);

    const prompt = this.buildSummaryPrompt(toSummarize);
    const summary = await this.llm.complete(prompt);

    const summaryMessage: TranscriptMessage = {
      role: 'system',
      content: summary,
      timestamp: new Date().toISOString(),
    };

    return [summaryMessage, ...kept];
  }

  private buildSummaryPrompt(messages: TranscriptMessage[]): string {
    const formatted = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    const safetyContext = messages
      .filter((m) =>
        SAFETY_KEYWORDS.some((kw) => m.content.toLowerCase().includes(kw)),
      )
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    return [
      'Summarize the following conversation history concisely.',
      'Preserve all safety-relevant state including: files changed, pending approvals, errors, destructive actions, and approval decisions.',
      '',
      'Conversation:',
      formatted,
      '',
      ...(safetyContext
        ? [
            'Safety-relevant messages (MUST be preserved in summary):',
            safetyContext,
          ]
        : []),
    ].join('\n');
  }
}
