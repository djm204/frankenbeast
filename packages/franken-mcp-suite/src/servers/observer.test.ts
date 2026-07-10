import { describe, it, expect, vi } from 'vitest';
import { createObserverServer } from './observer.js';

describe('Observer Server', () => {
  it('exposes 5 tools', () => {
    const server = createObserverServer({
      observer: {
        log: vi.fn(),
        logCost: vi.fn(),
        cost: vi.fn(),
        trail: vi.fn(),
        verify: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual([
      'fbeast_observer_log',
      'fbeast_observer_log_cost',
      'fbeast_observer_cost',
      'fbeast_observer_trail',
      'fbeast_observer_verify',
    ]);
  });

  it('delegates log, logCost, cost, and trail calls to the observer adapter', async () => {
    const observer = {
      log: vi.fn().mockResolvedValue({ id: 42, hash: 'abc123' }),
      logCost: vi.fn().mockResolvedValue({ costUsd: 0, unknownModel: true }),
      cost: vi.fn().mockResolvedValue({
        totalPromptTokens: 3000,
        totalCompletionTokens: 1300,
        totalCostUsd: 0.129,
        byModel: [
          { model: 'claude-opus-4', promptTokens: 3000, completionTokens: 1300, costUsd: 0.129 },
        ],
      }),
      trail: vi.fn().mockResolvedValue([
        {
          eventType: 'file_edit',
          payload: '{"file":"src/app.ts"}',
          hash: 'abc123',
          createdAt: '2026-04-10T00:00:00.000Z',
        },
      ]),
      verify: vi.fn().mockResolvedValue({ ok: true, checked: 1 }),
    };

    const server = createObserverServer({ observer });
    const logTool = server.tools.find((t) => t.name === 'fbeast_observer_log')!;
    const logCostTool = server.tools.find((t) => t.name === 'fbeast_observer_log_cost')!;
    const costTool = server.tools.find((t) => t.name === 'fbeast_observer_cost')!;
    const trailTool = server.tools.find((t) => t.name === 'fbeast_observer_trail')!;
    const verifyTool = server.tools.find((t) => t.name === 'fbeast_observer_verify')!;

    const logResult = await logTool.handler({
      event: 'file_edit',
      metadata: '{"file":"src/app.ts"}',
      sessionId: 'sess-1',
    });
    expect(observer.log).toHaveBeenCalledWith({
      event: 'file_edit',
      metadata: '{"file":"src/app.ts"}',
      sessionId: 'sess-1',
    });
    expect(logResult.content[0]!.text).toContain('Logged event');

    const logCostResult = await logCostTool.handler({
      sessionId: 'sess-1', model: 'gpt-4o', promptTokens: 1000, completionTokens: 200,
    });
    expect(observer.logCost).toHaveBeenCalledWith({
      sessionId: 'sess-1', model: 'gpt-4o', promptTokens: 1000, completionTokens: 200,
    });
    expect(logCostResult.content[0]!.text).toContain('1000');
    expect(logCostResult.content[0]!.text).toContain('$0.0000');
    expect(logCostResult.content[0]!.text).toContain('unknown model');

    const costResult = await costTool.handler({ sessionId: 'sess-1' });
    expect(observer.cost).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    expect(costResult.content[0]!.text).toContain('3000');
    expect(costResult.content[0]!.text).toContain('1300');

    const trailResult = await trailTool.handler({ sessionId: 'sess-1' });
    expect(observer.trail).toHaveBeenCalledWith('sess-1');
    expect(trailResult.content[0]!.text).toContain('file_edit');

    const verifyResult = await verifyTool.handler({ sessionId: 'sess-1' });
    expect(observer.verify).toHaveBeenCalledWith('sess-1');
    expect(verifyResult.content[0]!.text).toContain('verified');
  });

  it('rejects invalid cost inputs before calling the observer adapter', async () => {
    const observer = {
      log: vi.fn(),
      logCost: vi.fn().mockResolvedValue({ costUsd: 0, unknownModel: false }),
      cost: vi.fn(),
      trail: vi.fn(),
      verify: vi.fn(),
    };
    const logCostTool = createObserverServer({ observer }).tools.find((t) => t.name === 'fbeast_observer_log_cost')!;

    const invalidCases = [
      { promptTokens: 'NaN', completionTokens: 0 },
      { promptTokens: 'Infinity', completionTokens: 0 },
      { promptTokens: -1, completionTokens: 0 },
      { promptTokens: 1.5, completionTokens: 0 },
      { promptTokens: 0, completionTokens: Number.NaN },
      { promptTokens: 0, completionTokens: Number.POSITIVE_INFINITY },
      { promptTokens: 0, completionTokens: -1 },
      { promptTokens: 0, completionTokens: 1.5 },
      { promptTokens: 0, completionTokens: 0, costUsd: Number.NaN },
      { promptTokens: 0, completionTokens: 0, costUsd: Number.POSITIVE_INFINITY },
      { promptTokens: 0, completionTokens: 0, costUsd: -0.01 },
    ];

    for (const args of invalidCases) {
      const result = await logCostTool.handler({
        sessionId: 'sess-1',
        model: 'gpt-4o',
        ...args,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Error: fbeast_observer_log_cost');
    }

    expect(observer.logCost).not.toHaveBeenCalled();

    const zeroResult = await logCostTool.handler({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    });

    expect(zeroResult.isError).toBeUndefined();
    expect(observer.logCost).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    });
  });
});
