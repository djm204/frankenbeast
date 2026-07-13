import type { ILlmClient } from '@franken/types';
import type { MemoryContext } from '../deps.js';

type LlmSkillResult = { output: string; tokensUsed: number };

export interface LlmSkillHandlerOptions {
  /** Maximum characters reserved for injected memory context in the prompt. */
  readonly memoryContextBudgetChars?: number | undefined;
}

type MemorySection = 'adrs' | 'rules' | 'knownErrors';

type RankedMemoryEntry = {
  readonly section: MemorySection;
  readonly label: string;
  readonly text: string;
  readonly priority: number;
  readonly originalIndex: number;
};

const DEFAULT_MEMORY_CONTEXT_BUDGET_CHARS = 6_000;
const MEMORY_CONTEXT_HEADER = 'Memory Context:';

export class LlmSkillHandler {
  private readonly llmClient: ILlmClient;
  private readonly memoryContextBudgetChars: number;

  constructor(llmClient: ILlmClient, options: LlmSkillHandlerOptions = {}) {
    this.llmClient = llmClient;
    this.memoryContextBudgetChars = Math.max(120, options.memoryContextBudgetChars ?? DEFAULT_MEMORY_CONTEXT_BUDGET_CHARS);
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
      this.buildMemoryContextBlock(context),
    ].join('\n');
  }

  private buildMemoryContextBlock(context: MemoryContext): string {
    const entries = this.rankMemoryEntries(context);
    if (entries.length === 0) {
      return `${MEMORY_CONTEXT_HEADER}\n(none)`;
    }

    const selectedLines: string[] = [];
    let omitted = 0;

    for (const entry of entries) {
      const line = this.formatMemoryEntry(entry);
      const nextLines = [...selectedLines, line];
      const remainingAfterThis = entries.length - selectedLines.length - 1;
      const needsMarker = omitted + remainingAfterThis > 0;
      const candidate = this.renderMemoryContextBlock(nextLines, needsMarker ? omitted + remainingAfterThis : 0);

      if (candidate.length <= this.memoryContextBudgetChars) {
        selectedLines.push(line);
      } else {
        omitted += 1;
      }
    }

    if (selectedLines.length === 0) {
      const first = entries[0]!;
      const marker = this.truncationMarker(entries.length - 1);
      const budgetForLine = this.memoryContextBudgetChars - MEMORY_CONTEXT_HEADER.length - marker.length - 4;
      selectedLines.push(this.truncateLine(this.formatMemoryEntry(first), budgetForLine));
      omitted = entries.length - 1;
    }

    let block = this.renderMemoryContextBlock(selectedLines, omitted);
    while (block.length > this.memoryContextBudgetChars && selectedLines.length > 1) {
      selectedLines.pop();
      omitted += 1;
      block = this.renderMemoryContextBlock(selectedLines, omitted);
    }

    return block;
  }

  private rankMemoryEntries(context: MemoryContext): RankedMemoryEntry[] {
    const entries: RankedMemoryEntry[] = [];
    let originalIndex = 0;

    const pushEntries = (section: MemorySection, label: string, values: readonly string[]) => {
      for (const value of values) {
        entries.push({
          section,
          label,
          text: value,
          priority: this.memoryPriority(value, section),
          originalIndex,
        });
        originalIndex += 1;
      }
    };

    pushEntries('rules', 'Rules', context.rules);
    pushEntries('adrs', 'ADRs', context.adrs);
    pushEntries('knownErrors', 'Known Errors', context.knownErrors);

    return entries.sort((left, right) =>
      left.priority - right.priority ||
      this.sectionPriority(left.section) - this.sectionPriority(right.section) ||
      left.text.localeCompare(right.text) ||
      left.originalIndex - right.originalIndex,
    );
  }

  private memoryPriority(value: string, section: MemorySection): number {
    const normalized = value.toLowerCase();
    if (normalized.includes('user preference')) return 0;
    if (normalized.includes('project convention') || normalized.includes('active project')) return 1;
    if (normalized.includes('environment memory')) return 2;
    if (normalized.includes('procedure memory')) return 3;
    if (normalized.includes('stale')) return 20;
    if (normalized.includes('archived')) return 19;

    switch (section) {
      case 'rules':
        return 4;
      case 'adrs':
        return 5;
      case 'knownErrors':
        return 10;
    }
  }

  private sectionPriority(section: MemorySection): number {
    switch (section) {
      case 'rules':
        return 0;
      case 'adrs':
        return 1;
      case 'knownErrors':
        return 2;
    }
  }

  private formatMemoryEntry(entry: RankedMemoryEntry): string {
    return `- [${entry.label}] ${entry.text}`;
  }

  private renderMemoryContextBlock(lines: readonly string[], omitted: number): string {
    const body = omitted > 0 ? [...lines, this.truncationMarker(omitted)] : [...lines];
    return [MEMORY_CONTEXT_HEADER, ...body].join('\n');
  }

  private truncationMarker(omitted: number): string {
    return `[memory truncated: ${omitted} lower-priority entr${omitted === 1 ? 'y' : 'ies'} omitted]`;
  }

  private truncateLine(line: string, budget: number): string {
    if (line.length <= budget) return line;
    if (budget <= 1) return '…';
    return `${line.slice(0, budget - 1)}…`;
  }

  private estimateTokens(prompt: string, response: string): number {
    return Math.ceil((prompt.length + response.length) / 4);
  }
}
