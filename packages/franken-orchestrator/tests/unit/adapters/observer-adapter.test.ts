import { describe, it, expect, vi } from 'vitest';
import { ObserverPortAdapter } from '../../../src/adapters/observer-adapter.js';

const makeTrace = () => ({
  id: 'trace-1',
  goal: 'session-1',
  status: 'active' as const,
  startedAt: Date.now(),
  spans: [] as Array<any>,
});

const makeSpan = (traceId: string, name: string) => ({
  id: 'span-1',
  traceId,
  name,
  status: 'active' as const,
  startedAt: Date.now(),
  metadata: {},
  thoughtBlocks: [],
});

describe('ObserverPortAdapter', () => {
  it('wraps TraceContext startTrace/startSpan', () => {
    const trace = makeTrace();
    const traceContext = {
      createTrace: vi.fn().mockReturnValue(trace),
      startSpan: vi.fn().mockImplementation((_trace: any, options: any) => {
        const span = makeSpan(trace.id, options.name);
        trace.spans.push(span);
        return span;
      }),
      endSpan: vi.fn(),
    };

    const adapter = new ObserverPortAdapter({
      traceContext,
      costCalculator: { calculate: vi.fn().mockReturnValue(0) },
    });

    adapter.startTrace('session-1');
    const handle = adapter.startSpan('task:1');
    handle.end({ taskId: 'task-1' });

    expect(traceContext.createTrace).toHaveBeenCalledWith('session-1');
    expect(traceContext.startSpan).toHaveBeenCalledWith(trace, { name: 'task:1' });
    expect(traceContext.endSpan).toHaveBeenCalledTimes(1);
  });

  it('computes token spend from span metadata', async () => {
    const trace = makeTrace();
    const traceContext = {
      createTrace: vi.fn().mockReturnValue(trace),
      startSpan: vi.fn().mockImplementation((_trace: any, options: any) => {
        const span = makeSpan(trace.id, options.name);
        trace.spans.push(span);
        return span;
      }),
      endSpan: vi.fn(),
    };

    const costCalculator = {
      calculate: vi.fn().mockReturnValue(0.25),
    };

    const adapter = new ObserverPortAdapter({ traceContext, costCalculator });
    adapter.startTrace('session-1');

    const handle = adapter.startSpan('task:1');
    handle.end({ promptTokens: 10, completionTokens: 5, model: 'gpt-4o' });

    const spend = await adapter.getTokenSpend('session-1');

    expect(spend).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      estimatedCostUsd: 0.25,
    });
    expect(costCalculator.calculate).toHaveBeenCalledWith({
      model: 'gpt-4o',
      promptTokens: 10,
      completionTokens: 5,
    });
  });

  it('wraps trace errors', () => {
    const traceContext = {
      createTrace: vi.fn().mockReturnValue(makeTrace()),
      startSpan: vi.fn().mockImplementation(() => {
        throw new Error('boom');
      }),
      endSpan: vi.fn(),
    };

    const adapter = new ObserverPortAdapter({
      traceContext,
      costCalculator: { calculate: vi.fn().mockReturnValue(0) },
    });

    adapter.startTrace('session-1');
    expect(() => adapter.startSpan('task:1')).toThrow('ObserverPortAdapter failed');
  });
});
