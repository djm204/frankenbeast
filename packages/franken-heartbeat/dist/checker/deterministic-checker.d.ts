import type { PulseResult } from '../core/types.js';
import type { WatchlistItem } from '../checklist/parser.js';
import type { IObservabilityModule } from '../modules/observability.js';
export interface GitStatusResult {
    dirty: boolean;
    files: string[];
}
export interface DeterministicCheckerDeps {
    readonly observability: IObservabilityModule;
    readonly gitStatusExecutor: () => Promise<GitStatusResult>;
    readonly clock: () => Date;
    readonly config: {
        readonly deepReviewHour: number;
        readonly tokenSpendAlertThreshold: number;
    };
}
export declare class DeterministicChecker {
    private readonly deps;
    constructor(deps: DeterministicCheckerDeps);
    check(watchlist: readonly WatchlistItem[]): Promise<PulseResult>;
}
//# sourceMappingURL=deterministic-checker.d.ts.map