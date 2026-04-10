import { describe, it, expect, vi } from 'vitest';
import { createObserverServer } from './observer.js';

describe('Observer Server', () => {
  it('exposes 3 tools', () => {
    const server = createObserverServer({
      observer: {
        log: vi.fn(),
        cost: vi.fn(),
        trail: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_observer_log', 'fbeast_observer_cost', 'fbeast_observer_trail']);
  });

  it('delegates log, cost, and trail calls to the observer adapter', async () => {
    const observer = {
      log: vi.fn().mockResolvedValue({ id: 42, hash: 'abc123' }),
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
    };

    const server = createObserverServer({ observer });
    const logTool = server.tools.find((t) => t.name === 'fbeast_observer_log')!;
    const costTool = server.tools.find((t) => t.name === 'fbeast_observer_cost')!;
    const trailTool = server.tools.find((t) => t.name === 'fbeast_observer_trail')!;

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

    const costResult = await costTool.handler({ sessionId: 'sess-1' });
    expect(observer.cost).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    expect(costResult.content[0]!.text).toContain('3000');
    expect(costResult.content[0]!.text).toContain('1300');

    const trailResult = await trailTool.handler({ sessionId: 'sess-1' });
    expect(observer.trail).toHaveBeenCalledWith('sess-1');
    expect(trailResult.content[0]!.text).toContain('file_edit');
  });
});
