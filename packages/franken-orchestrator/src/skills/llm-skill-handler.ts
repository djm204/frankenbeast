import type { ILlmClient } from '@franken/core';
import type { MemoryContext } from '../deps.js';

type LlmSkillResult = { output: string; tokensUsed: number };

export class LlmSkillHandler {
  private readonly llmClient: ILlmClient;

  constructor(llmClient: ILlmClient) {
    this.llmClient = llmClient;
  }

  async execute(objective: string, context: MemoryContext): Promise<LlmSkillResult> {
    const prompt = this.buildPrompt(objective, context);

    try {
      const response = await this.llmClient.complete(prompt);
      return {
        output: response,
        tokensUsed: this.estimateTokens(prompt, response),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Skill execution failed for objective "${objective}": ${message}`);
    }
  }

  private buildPrompt(objective: string, context: MemoryContext): string {
    return [
      'Objective:',
      objective,
      '',
      'ADRs:',
      ...this.formatSection(context.adrs),
      '',
      'Rules:',
      ...this.formatSection(context.rules),
      '',
      'Known Errors:',
      ...this.formatSection(context.knownErrors),
    ].join('\n');
  }

  private formatSection(entries: readonly string[]): string[] {
    if (entries.length === 0) {
      return ['(none)'];
    }

    return entries.map(entry => `- ${entry}`);
  }

  private estimateTokens(prompt: string, response: string): number {
    return Math.ceil((prompt.length + response.length) / 4);
  }
}
