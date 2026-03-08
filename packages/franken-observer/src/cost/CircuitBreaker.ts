export interface CircuitBreakerOptions {
  limitUsd: number
}

export interface CircuitBreakerResult {
  tripped: boolean
  limitUsd: number
  spendUsd: number
}

type LimitReachedHandler = (result: CircuitBreakerResult) => void

/**
 * Non-blocking budget guard. Emits a 'limit-reached' event when
 * cumulative spend exceeds the configured USD limit. Never throws.
 */
export class CircuitBreaker {
  private readonly limitUsd: number
  private readonly handlers = new Set<LimitReachedHandler>()

  constructor(options: CircuitBreakerOptions) {
    this.limitUsd = options.limitUsd
  }

  check(spendUsd: number): CircuitBreakerResult {
    const result: CircuitBreakerResult = {
      tripped: spendUsd > this.limitUsd,
      limitUsd: this.limitUsd,
      spendUsd,
    }
    if (result.tripped) {
      for (const handler of this.handlers) {
        handler(result)
      }
    }
    return result
  }

  on(event: 'limit-reached', handler: LimitReachedHandler): void {
    this.handlers.add(handler)
  }

  off(event: 'limit-reached', handler: LimitReachedHandler): void {
    this.handlers.delete(handler)
  }
}
