import type { WorkingTurn } from '../types/index.js';
import { TokenBudget } from '../types/index.js';
import type { ICompressionStrategy } from './compression-strategy.js';
import { partitionForPruning } from './partition-for-pruning.js';

export class WorkingMemoryStore {
  private readonly turns: WorkingTurn[] = [];
  private totalTokens = 0;

  constructor(private readonly strategy: ICompressionStrategy) {}

  push(turn: WorkingTurn): void {
    this.turns.push(turn);
    this.totalTokens += turn.tokenCount;
  }

  snapshot(): WorkingTurn[] {
    return [...this.turns];
  }

  clear(): void {
    this.turns.length = 0;
    this.totalTokens = 0;
  }

  getTokenCount(): number {
    return this.totalTokens;
  }

  async prune(budget: TokenBudget): Promise<void> {
    if (this.turns.length === 0) return;

    const effective = new TokenBudget(budget.budget, this.totalTokens);
    if (!effective.isPressured()) return;

    const { preserved, candidates } = partitionForPruning(this.turns);
    if (candidates.length === 0) return;

    const { summary } = await this.strategy.compress(candidates, budget.remaining());

    // Rebuild in place: preserved turns (original relative order) then summary.
    this.turns.length = 0;
    this.totalTokens = 0;

    for (const t of preserved) {
      this.turns.push(t);
      this.totalTokens += t.tokenCount;
    }

    this.turns.push(summary);
    this.totalTokens += summary.tokenCount;
  }
}
