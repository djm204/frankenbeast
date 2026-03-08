import { describe, it, expect } from 'vitest';
import { TriggerRegistry } from '../../../src/triggers/trigger-registry.js';
import type { TriggerEvaluator } from '../../../src/triggers/trigger-evaluator.js';
import type { TriggerResult } from '../../../src/core/types.js';

function makeFakeEvaluator(triggerId: string, result: TriggerResult): TriggerEvaluator {
  return { triggerId, evaluate: () => result };
}

describe('TriggerRegistry', () => {
  it('returns not-triggered when no evaluators are registered', () => {
    const registry = new TriggerRegistry([]);
    const result = registry.evaluateAll({});
    expect(result.triggered).toBe(false);
  });

  it('returns not-triggered when no evaluator fires', () => {
    const registry = new TriggerRegistry([
      makeFakeEvaluator('a', { triggered: false, triggerId: 'a' }),
      makeFakeEvaluator('b', { triggered: false, triggerId: 'b' }),
    ]);
    const result = registry.evaluateAll({});
    expect(result.triggered).toBe(false);
  });

  it('returns the first triggered result', () => {
    const registry = new TriggerRegistry([
      makeFakeEvaluator('a', { triggered: false, triggerId: 'a' }),
      makeFakeEvaluator('b', { triggered: true, triggerId: 'b', reason: 'budget breach', severity: 'critical' }),
    ]);
    const result = registry.evaluateAll({});
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.triggerId).toBe('b');
      expect(result.reason).toBe('budget breach');
    }
  });

  it('stops at the first triggered evaluator', () => {
    let secondCalled = false;
    const registry = new TriggerRegistry([
      makeFakeEvaluator('a', { triggered: true, triggerId: 'a', reason: 'first', severity: 'high' }),
      {
        triggerId: 'b',
        evaluate: () => {
          secondCalled = true;
          return { triggered: true, triggerId: 'b', reason: 'second', severity: 'low' };
        },
      },
    ]);
    const result = registry.evaluateAll({});
    expect(result.triggerId).toBe('a');
    expect(secondCalled).toBe(false);
  });
});
