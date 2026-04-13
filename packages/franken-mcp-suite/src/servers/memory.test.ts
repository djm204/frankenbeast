import { describe, it, expect, vi } from 'vitest';
import { createMemoryServer } from './memory.js';

describe('Memory Server', () => {
  it('exposes 4 tools', () => {
    const server = createMemoryServer({
      brain: {
        query: vi.fn(),
        store: vi.fn(),
        frontload: vi.fn(),
        forget: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual([
      'fbeast_memory_query',
      'fbeast_memory_store',
      'fbeast_memory_frontload',
      'fbeast_memory_forget',
    ]);
  });

  it('delegates memory store/query/frontload/forget to the brain adapter', async () => {
    const brain = {
      query: vi.fn().mockResolvedValue([
        { key: 'adr', value: 'use adapters', type: 'working', createdAt: '2026-04-10T00:00:00.000Z' },
      ]),
      store: vi.fn().mockResolvedValue(undefined),
      frontload: vi.fn().mockResolvedValue([
        { type: 'working', entries: ['adr: use adapters'] },
      ]),
      forget: vi.fn().mockResolvedValue(true),
    };

    const server = createMemoryServer({ brain });
    const storeTool = server.tools.find((t) => t.name === 'fbeast_memory_store')!;
    const queryTool = server.tools.find((t) => t.name === 'fbeast_memory_query')!;
    const frontloadTool = server.tools.find((t) => t.name === 'fbeast_memory_frontload')!;
    const forgetTool = server.tools.find((t) => t.name === 'fbeast_memory_forget')!;

    await storeTool.handler({ key: 'adr', value: 'use adapters', type: 'working' });
    expect(brain.store).toHaveBeenCalledWith({ key: 'adr', value: 'use adapters', type: 'working' });

    const queryResult = await queryTool.handler({ query: 'adr', type: 'working', limit: 5 });
    expect(brain.query).toHaveBeenCalledWith({ query: 'adr', type: 'working', limit: 5 });
    expect(queryResult.content[0]!.text).toContain('use adapters');

    const frontloadResult = await frontloadTool.handler({ projectId: 'test-project' });
    expect(brain.frontload).toHaveBeenCalledWith('test-project');
    expect(frontloadResult.content[0]!.text).toContain('adr: use adapters');

    const forgetResult = await forgetTool.handler({ key: 'adr' });
    expect(brain.forget).toHaveBeenCalledWith('adr');
    expect(forgetResult.content[0]!.text).toContain('Removed memory: adr');
  });
});
