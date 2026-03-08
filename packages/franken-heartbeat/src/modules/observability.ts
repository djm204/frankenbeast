/**
 * MOD-05 (Observability) contract — what MOD-08 requires from the observability system.
 */

export interface Trace {
  readonly id: string;
  readonly spanCount: number;
  readonly status: 'ok' | 'error';
  readonly durationMs: number;
  readonly timestamp: string;
}

export interface TokenSpendSummary {
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly breakdown: ReadonlyArray<{
    readonly model: string;
    readonly tokens: number;
    readonly costUsd: number;
  }>;
}

export interface IObservabilityModule {
  getTraces(since: Date): Promise<Trace[]>;
  getTokenSpend(since: Date): Promise<TokenSpendSummary>;
}
