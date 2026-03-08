export type EvalStatus = 'pass' | 'fail' | 'skip'

export interface EvalResult {
  evalName: string
  status: EvalStatus
  /** 0–1 confidence / quality score. Optional for deterministic evals. */
  score?: number
  /** Human-readable explanation, especially on failure. */
  reason?: string
  /** Structured extra data (e.g. which rules failed, diff details). */
  details?: Record<string, unknown>
}

/**
 * An eval definition. TInput is the data the eval inspects.
 * run() may return synchronously or return a Promise.
 */
export interface Eval<TInput = unknown> {
  readonly name: string
  run(input: TInput): EvalResult | Promise<EvalResult>
}
