import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';

export class ConsensusFailureBreaker implements CircuitBreaker {
  readonly name = 'consensus-failure';

  check(state: LoopState, config: LoopConfig): CircuitBreakerResult {
    for (const [category, count] of state.failureHistory) {
      if (count >= config.consensusThreshold) {
        return {
          tripped: true,
          reason: `Consensus failure: evaluator "${category}" failed ${count} times without improvement`,
          action: 'escalate',
        };
      }
    }

    return { tripped: false };
  }
}
