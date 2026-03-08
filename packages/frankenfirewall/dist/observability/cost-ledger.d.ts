/**
 * In-memory accumulator of USD spend per session.
 * See ADR-0007 for scope and known limitations.
 */
export declare class CostLedger {
    private readonly ledger;
    /** Adds cost for a session. Creates the session entry if it doesn't exist. */
    record(sessionId: string, costUsd: number): void;
    /** Returns total accumulated spend for the session. */
    getTotal(sessionId: string): number;
    /**
     * Returns true if adding `additionalCostUsd` would exceed `ceilingUsd`.
     * The check is pessimistic: it uses the estimated additional cost,
     * not the actual post-call cost.
     */
    wouldExceed(sessionId: string, additionalCostUsd: number, ceilingUsd: number): boolean;
    /** Resets a session's ledger entry (useful for testing). */
    reset(sessionId: string): void;
}
//# sourceMappingURL=cost-ledger.d.ts.map