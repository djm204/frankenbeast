import { describe, it, expect } from 'vitest';
import { BudgetTrigger } from '../../../src/triggers/budget-trigger.js';
import type { BudgetTriggerContext } from '../../../src/triggers/budget-trigger.js';

function makeBudgetContext(overrides: Partial<BudgetTriggerContext> = {}): BudgetTriggerContext {
  return { tripped: false, limitUsd: 1.0, spendUsd: 0.5, ...overrides };
}

describe('BudgetTrigger', () => {
  const trigger = new BudgetTrigger();

  it('has triggerId "budget"', () => {
    expect(trigger.triggerId).toBe('budget');
  });

  it('triggers when tripped is true', () => {
    const result = trigger.evaluate(makeBudgetContext({ tripped: true, spendUsd: 1.5 }));
    expect(result.triggered).toBe(true);
  });

  it('does not trigger when tripped is false', () => {
    const result = trigger.evaluate(makeBudgetContext({ tripped: false }));
    expect(result.triggered).toBe(false);
  });

  it('carries budget details in reason when triggered', () => {
    const result = trigger.evaluate(makeBudgetContext({ tripped: true, spendUsd: 1.5, limitUsd: 1.0 }));
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.reason).toContain('1.5');
      expect(result.reason).toContain('1');
    }
  });

  it('sets severity to critical when triggered', () => {
    const result = trigger.evaluate(makeBudgetContext({ tripped: true }));
    if (result.triggered) {
      expect(result.severity).toBe('critical');
    }
  });
});
