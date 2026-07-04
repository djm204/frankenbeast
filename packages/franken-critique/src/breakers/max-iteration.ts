import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';
import { hasReachedMaxIterations } from '../loop/iteration-limit.js';

export class MaxIterationBreaker implements CircuitBreaker {
  readonly name = 'max-iteration';

  async check(state: LoopState, config: LoopConfig): Promise<CircuitBreakerResult> {
    if (hasReachedMaxIterations(state.iterationCount, config.maxIterations)) {
      return {
        tripped: true,
        reason: `Maximum iterations reached (${config.maxIterations})`,
        action: 'halt',
      };
    }

    return { tripped: false };
  }
}
