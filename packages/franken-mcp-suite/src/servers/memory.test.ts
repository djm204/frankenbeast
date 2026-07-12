import { describe, it, expect, vi } from 'vitest';
import { createToolDefsForServer } from '../shared/tool-registry.js';
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
      'fbeast_memory_store',
      'fbeast_memory_query',
      'fbeast_memory_frontload',
      'fbeast_memory_forget',
    ]);
    const storeTool = server.tools.find((t) => t.name === 'fbeast_memory_store')!;
    expect(storeTool.description).toBe('Store key/value in working or episodic memory');
  });

  it('limits memory type enums to working and episodic', () => {
    const storeTool = createMemoryServer({
      brain: {
        query: vi.fn(),
        store: vi.fn(),
        frontload: vi.fn(),
        forget: vi.fn(),
      },
    }).tools.find((t) => t.name === 'fbeast_memory_store')!;

    const queryTool = createMemoryServer({
      brain: {
        query: vi.fn(),
        store: vi.fn(),
        frontload: vi.fn(),
        forget: vi.fn(),
      },
    }).tools.find((t) => t.name === 'fbeast_memory_query')!;

    expect(storeTool.inputSchema.properties?.type).toMatchObject({
      enum: ['working', 'episodic'],
      description: 'Memory type: working or episodic',
    });
    expect(queryTool.inputSchema.properties?.type).toMatchObject({
      enum: ['working', 'episodic'],
      description: 'Filter by type: working or episodic',
    });
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

    expect(frontloadTool.inputSchema.required).toBeUndefined();
    expect(frontloadTool.inputSchema.properties).toHaveProperty('projectId');

    const frontloadResult = await frontloadTool.handler({ projectId: 'test-project' });
    expect(brain.frontload).toHaveBeenCalledWith();
    expect(frontloadResult.content[0]!.text).toContain('adr: use adapters');

    const forgetResult = await forgetTool.handler({ key: 'adr' });
    expect(brain.forget).toHaveBeenCalledWith('adr');
    expect(forgetResult.content[0]!.text).toContain('Removed memory: adr');
  });

  it('rejects invalid query limits before calling the brain adapter', async () => {
    for (const invalidLimit of ['abc', 'NaN', 'Infinity', '0', '-1', '1.5', '1001', '9007199254740993']) {
      const brain = {
        query: vi.fn().mockResolvedValue([]),
        store: vi.fn(),
        frontload: vi.fn(),
        forget: vi.fn(),
      };
      const server = createMemoryServer({ brain });
      const result = await server.callTool('fbeast_memory_query', { query: 'adr', limit: invalidLimit });

      expect(result.isError, invalidLimit).toBe(true);
      expect(result.content[0]!.text).toContain('limit must be a positive integer');
      expect(brain.query, invalidLimit).not.toHaveBeenCalled();
    }
  });

  it('applies shared registry query limit defaults and validation', async () => {
    const brain = {
      query: vi.fn().mockResolvedValue([]),
      store: vi.fn(),
      frontload: vi.fn(),
      forget: vi.fn(),
    };
    const queryTool = createToolDefsForServer('memory', { brain }).find((t) => t.name === 'fbeast_memory_query')!;

    await queryTool.handler({ query: 'adr' });
    await queryTool.handler({ query: 'adr', limit: '7' });
    const invalidResult = await queryTool.handler({ query: 'adr', limit: 'NaN' });

    expect(brain.query).toHaveBeenNthCalledWith(1, { query: 'adr', limit: 20 });
    expect(brain.query).toHaveBeenNthCalledWith(2, { query: 'adr', limit: 7 });
    expect(invalidResult.isError).toBe(true);
    expect(brain.query).toHaveBeenCalledTimes(2);
  });
});
