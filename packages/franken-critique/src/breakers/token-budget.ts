import type { CircuitBreaker, CircuitBreakerResult, LoopState, LoopConfig } from './circuit-breaker.js';
import type { ObservabilityPort } from '../types/contracts.js';

export class TokenBudgetBreaker implements CircuitBreaker {
  readonly name = 'token-budget';
  // Spend accumulates during each iteration, so this breaker must run both
  // before an iteration starts and after it completes — otherwise the tokens
  // spent by the terminal iteration would never be checked against the budget.
  readonly phase = 'both' as const;

  private readonly observability: ObservabilityPort;

  constructor(observability: ObservabilityPort) {
    this.observability = observability;
  }

  async check(_state: LoopState, config: LoopConfig): Promise<CircuitBreakerResult> {
    const spend = await this.observability.getTokenSpend(config.sessionId);

    // A dollar-denominated budget (e.g. the CLI `--budget <usd>` flag) must be
    // compared against estimated cost, not the raw token count.
    if (config.costBudgetUsd !== undefined && spend.estimatedCostUsd >= config.costBudgetUsd) {
      return {
        tripped: true,
        reason: `Cost budget exceeded: $${spend.estimatedCostUsd.toFixed(4)} >= $${config.costBudgetUsd.toFixed(4)} (${spend.totalTokens} tokens)`,
        action: 'halt',
      };
    }

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
