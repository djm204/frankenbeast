/**
 * In-memory accumulator of USD spend per session.
 * See ADR-0007 for scope and known limitations.
 */
export class CostLedger {
  private readonly ledger = new Map<string, number>();

  /** Adds cost for a session. Creates the session entry if it doesn't exist. */
  record(sessionId: string, costUsd: number): void {
    const current = this.ledger.get(sessionId) ?? 0;
    this.ledger.set(sessionId, current + costUsd);
  }

  /** Returns total accumulated spend for the session. */
  getTotal(sessionId: string): number {
    return this.ledger.get(sessionId) ?? 0;
  }

  /**
   * Returns true if adding `additionalCostUsd` would exceed `ceilingUsd`.
   * The check is pessimistic: it uses the estimated additional cost,
   * not the actual post-call cost.
   */
  wouldExceed(sessionId: string, additionalCostUsd: number, ceilingUsd: number): boolean {
    return this.getTotal(sessionId) + additionalCostUsd > ceilingUsd;
  }

  /** Resets a session's ledger entry (useful for testing). */
  reset(sessionId: string): void {
    this.ledger.delete(sessionId);
  }
}
