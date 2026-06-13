import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';
import type { ObservabilityPort } from '../types/contracts.js';

export class TokenBudgetBreaker implements CircuitBreaker {
  readonly name = 'token-budget';

  private readonly observability: ObservabilityPort;

  constructor(observability: ObservabilityPort) {
    this.observability = observability;
  }

  async check(_state: LoopState, config: LoopConfig): Promise<CircuitBreakerResult> {
    const spend = await this.observability.getTokenSpend(config.sessionId);

    if (spend.totalTokens >= config.tokenBudget) {
      return {
        tripped: true,
        reason: `Token budget exceeded: ${spend.totalTokens} >= ${config.tokenBudget} (estimated cost: $${spend.estimatedCostUsd.toFixed(4)})`,
        action: 'halt',
      };
    }

    return { tripped: false };
  }
}
