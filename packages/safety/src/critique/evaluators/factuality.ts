import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';
import type { MemoryPort } from '../types/contracts.js';

const RELEVANCE_THRESHOLD = 0.7;
const TOP_K = 5;

export class FactualityEvaluator implements Evaluator {
  readonly name = 'factuality';
  readonly category = 'heuristic' as const;

  private readonly memory: MemoryPort;

  constructor(memory: MemoryPort) {
    this.memory = memory;
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const query = this.extractQuery(input.content);
    const adrs = await this.memory.searchADRs(query, TOP_K);

    const findings: EvaluationFinding[] = [];

    for (const adr of adrs) {
      if (adr.relevanceScore >= RELEVANCE_THRESHOLD) {
        findings.push({
          message: `ADR "${adr.title}" (${adr.id}) may be relevant — review for factual alignment (relevance: ${Math.round(adr.relevanceScore * 100)}%)`,
          severity: 'info',
          suggestion: `Verify content aligns with: ${adr.content.slice(0, 100)}...`,
        });
      }
    }

    const score = findings.length === 0 ? 1 : Math.max(0.3, 1 - findings.length * 0.15);

    return {
      evaluatorName: this.name,
      verdict: 'pass',
      score,
      findings,
    };
  }

  private extractQuery(content: string): string {
    // Take the first 200 chars as a search query, trimmed to word boundaries
    const trimmed = content.slice(0, 200).trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    return lastSpace > 50 ? trimmed.slice(0, lastSpace) : trimmed;
  }
}
