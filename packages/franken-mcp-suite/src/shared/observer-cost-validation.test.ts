import { describe, expect, it } from 'vitest';
import { parseObserverCostArgs, validateObserverCostNumbers } from './observer-cost-validation.js';

describe('observer cost validation', () => {
  it('parses valid zero and positive token/cost inputs', () => {
    expect(parseObserverCostArgs({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      promptTokens: 0,
      completionTokens: '25',
      costUsd: '0.001',
    })).toEqual({
      ok: true,
      value: {
        sessionId: 'sess-1',
        model: 'gpt-4o',
        promptTokens: 0,
        completionTokens: 25,
        costUsd: 0.001,
      },
    });
  });

  it('rejects invalid token and cost inputs before adapter persistence', () => {
    const cases = [
      { field: 'promptTokens', args: { promptTokens: 'NaN', completionTokens: 0 } },
      { field: 'promptTokens', args: { promptTokens: 'Infinity', completionTokens: 0 } },
      { field: 'promptTokens', args: { promptTokens: -1, completionTokens: 0 } },
      { field: 'promptTokens', args: { promptTokens: 1.5, completionTokens: 0 } },
      { field: 'promptTokens', args: { promptTokens: Number.MAX_SAFE_INTEGER + 1, completionTokens: 0 } },
      { field: 'completionTokens', args: { promptTokens: 0, completionTokens: 'NaN' } },
      { field: 'completionTokens', args: { promptTokens: 0, completionTokens: 'Infinity' } },
      { field: 'completionTokens', args: { promptTokens: 0, completionTokens: -1 } },
      { field: 'completionTokens', args: { promptTokens: 0, completionTokens: 1.5 } },
      { field: 'completionTokens', args: { promptTokens: 0, completionTokens: Number.MAX_SAFE_INTEGER + 1 } },
      { field: 'costUsd', args: { promptTokens: 0, completionTokens: 0, costUsd: 'NaN' } },
      { field: 'costUsd', args: { promptTokens: 0, completionTokens: 0, costUsd: 'Infinity' } },
      { field: 'costUsd', args: { promptTokens: 0, completionTokens: 0, costUsd: -0.01 } },
    ];

    for (const { field, args } of cases) {
      const result = parseObserverCostArgs({
        sessionId: 'sess-1',
        model: 'gpt-4o',
        ...args,
      });

      if (result.ok) {
        throw new Error(`Expected ${field} case to be rejected`);
      }
      expect(result).toMatchObject({ ok: false, message: expect.stringContaining(field) });
    }
  });

  it('defends ObserverAdapter.logCost callers with runtime validation too', () => {
    expect(() => validateObserverCostNumbers({
      promptTokens: Number.NaN,
      completionTokens: 0,
    })).toThrow('promptTokens must be a finite safe non-negative integer');

    expect(() => validateObserverCostNumbers({
      promptTokens: 0,
      completionTokens: Number.POSITIVE_INFINITY,
    })).toThrow('completionTokens must be a finite safe non-negative integer');

    expect(() => validateObserverCostNumbers({
      promptTokens: 0,
      completionTokens: 0,
      costUsd: -0.01,
    })).toThrow('costUsd must be a finite non-negative number');
  });
});
