import type { WorkingTurn } from '../types/index.js';
import { TokenBudget } from '../types/index.js';
import type { ICompressionStrategy } from './compression-strategy.js';
export declare class WorkingMemoryStore {
    private readonly strategy;
    private readonly turns;
    private totalTokens;
    constructor(strategy: ICompressionStrategy);
    push(turn: WorkingTurn): void;
    snapshot(): WorkingTurn[];
    clear(): void;
    getTokenCount(): number;
    prune(budget: TokenBudget): Promise<void>;
}
//# sourceMappingURL=working-memory-store.d.ts.map