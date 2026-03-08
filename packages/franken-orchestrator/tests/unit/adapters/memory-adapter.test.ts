import { describe, it, expect } from 'vitest';
import { MemoryPortAdapter } from '../../../src/adapters/memory-adapter.js';

describe('MemoryPortAdapter', () => {
  it('returns static context from config', async () => {
    const adapter = new MemoryPortAdapter({
      context: { adrs: ['ADR-1'], knownErrors: ['E1'], rules: ['R1'] },
    });

    const context = await adapter.getContext('project-1');

    expect(context).toEqual({
      adrs: ['ADR-1'],
      knownErrors: ['E1'],
      rules: ['R1'],
    });
  });

  it('records traces in memory', async () => {
    const adapter = new MemoryPortAdapter();

    await adapter.recordTrace({
      taskId: 'task-1',
      summary: 'Did thing',
      outcome: 'success',
      timestamp: '2026-03-05T00:00:00.000Z',
    });

    const traces = (adapter as { traces: unknown[] }).traces;
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      taskId: 'task-1',
      summary: 'Did thing',
      outcome: 'success',
    });
  });
});
