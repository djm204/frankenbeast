import { describe, it, expect } from 'vitest';
import { CliObserverBridge } from '../../src/adapters/cli-observer-bridge.js';

describe('Budget enforcement integration', () => {
  it('trips the circuit breaker when recorded cost exceeds budget', async () => {
    // Budget: $0.01, record tokens costing $0.02
    const bridge = new CliObserverBridge({ budgetLimitUsd: 0.01 });
    bridge.startTrace('budget-trip-test');
    const deps = bridge.observerDeps;

    // Record 1000 prompt + 1000 completion tokens as gpt-4o
    // gpt-4o: (1000/1M)*5 + (1000/1M)*15 = $0.005 + $0.015 = $0.02
    const span = deps.startSpan(deps.trace, { name: 'expensive-call' });
    deps.recordTokenUsage(
      span,
      { promptTokens: 1000, completionTokens: 1000, model: 'gpt-4o' },
      deps.counter,
    );
    deps.endSpan(span);

    // Compute actual cost from the counter
    const entries = deps.counter.allModels().map((m) => {
      const t = deps.counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const spendUsd = deps.costCalc.totalCost(entries);

    expect(spendUsd).toBeCloseTo(0.02, 4);

    const result = deps.breaker.check(spendUsd);
    expect(result.tripped).toBe(true);
    expect(result.spendUsd).toBeCloseTo(0.02, 4);
    expect(result.limitUsd).toBe(0.01);
  });

  it('does not trip the circuit breaker when usage is within budget', async () => {
    // Budget: $100, record tokens costing $0.02
    const bridge = new CliObserverBridge({ budgetLimitUsd: 100 });
    bridge.startTrace('budget-safe-test');
    const deps = bridge.observerDeps;

    // Record 1000 prompt + 1000 completion tokens as gpt-4o = $0.02
    const span = deps.startSpan(deps.trace, { name: 'cheap-call' });
    deps.recordTokenUsage(
      span,
      { promptTokens: 1000, completionTokens: 1000, model: 'gpt-4o' },
      deps.counter,
    );
    deps.endSpan(span);

    // Compute actual cost
    const entries = deps.counter.allModels().map((m) => {
      const t = deps.counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const spendUsd = deps.costCalc.totalCost(entries);

    expect(spendUsd).toBeCloseTo(0.02, 4);

    const result = deps.breaker.check(spendUsd);
    expect(result.tripped).toBe(false);
    expect(result.limitUsd).toBe(100);
  });

  it('observerDeps type satisfies CliSkillExecutor ObserverDeps interface', () => {
    const bridge = new CliObserverBridge({ budgetLimitUsd: 1.0 });
    bridge.startTrace('type-compat-test');
    const deps = bridge.observerDeps;

    // Verify all required properties/methods exist with correct shapes
    expect(deps.trace).toBeDefined();
    expect(deps.trace.id).toEqual(expect.any(String));
    expect(typeof deps.counter.grandTotal).toBe('function');
    expect(typeof deps.counter.allModels).toBe('function');
    expect(typeof deps.counter.totalsFor).toBe('function');
    expect(typeof deps.costCalc.totalCost).toBe('function');
    expect(typeof deps.breaker.check).toBe('function');
    expect(typeof deps.loopDetector.check).toBe('function');
    expect(typeof deps.startSpan).toBe('function');
    expect(typeof deps.endSpan).toBe('function');
    expect(typeof deps.recordTokenUsage).toBe('function');
    expect(typeof deps.setMetadata).toBe('function');
  });
});
