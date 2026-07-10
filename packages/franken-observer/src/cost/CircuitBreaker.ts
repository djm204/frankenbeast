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
 * cumulative spend exceeds the configured USD limit. Throws RangeError for
 * invalid numeric inputs so broken budget accounting cannot be reported safe.
 */
export class CircuitBreaker {
  private readonly limitUsd: number
  private readonly handlers = new Set<LimitReachedHandler>()
  private tripped = false

  constructor(options: CircuitBreakerOptions) {
    assertFiniteNonNegativeUsd('limitUsd', options.limitUsd)
    this.limitUsd = options.limitUsd
  }

  check(spendUsd: number): CircuitBreakerResult {
    assertFiniteNonNegativeUsd('spendUsd', spendUsd)
    const result: CircuitBreakerResult = {
      tripped: spendUsd > this.limitUsd,
      limitUsd: this.limitUsd,
      spendUsd,
    }
    if (result.tripped) {
      // Fire handlers only on the rising edge to avoid alert fatigue / repeated
      // HITL escalation while spend stays over the limit.
      if (!this.tripped) {
        this.tripped = true
        for (const handler of this.handlers) {
          handler(result)
        }
      }
    } else {
      // Spend recovered at/below the limit — re-arm so a future trip alerts again.
      this.tripped = false
    }
    return result
  }

  /**
   * Re-arm the breaker so the next trip fires handlers again. Use after a
   * HITL operator has acknowledged and remediated the overage.
   */
  reset(): void {
    this.tripped = false
  }

  on(event: 'limit-reached', handler: LimitReachedHandler): void {
    this.handlers.add(handler)
  }

  off(event: 'limit-reached', handler: LimitReachedHandler): void {
    this.handlers.delete(handler)
  }
}

function assertFiniteNonNegativeUsd(name: 'limitUsd' | 'spendUsd', value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`)
  }
}
