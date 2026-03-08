import { TokenBudget } from '../types/index.js';
import { partitionForPruning } from './partition-for-pruning.js';
export class WorkingMemoryStore {
    strategy;
    turns = [];
    totalTokens = 0;
    constructor(strategy) {
        this.strategy = strategy;
    }
    push(turn) {
        this.turns.push(turn);
        this.totalTokens += turn.tokenCount;
    }
    snapshot() {
        return [...this.turns];
    }
    clear() {
        this.turns.length = 0;
        this.totalTokens = 0;
    }
    getTokenCount() {
        return this.totalTokens;
    }
    async prune(budget) {
        if (this.turns.length === 0)
            return;
        const effective = new TokenBudget(budget.budget, this.totalTokens);
        if (!effective.isPressured())
            return;
        const { preserved, candidates } = partitionForPruning(this.turns);
        if (candidates.length === 0)
            return;
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
//# sourceMappingURL=working-memory-store.js.map