import { describe, it, expect, vi } from 'vitest';
import { AdapterLlmClient, AdapterLlmError, type IAdapter, type ILlmObserver } from '../../../src/adapters/adapter-llm-client.js';

function makeAdapter(overrides: Partial<IAdapter> = {}): IAdapter {
  return {
    transformRequest: vi.fn((req) => req),
    execute: vi.fn(async () => ({ raw: true })),
    transformResponse: vi.fn(() => ({ content: 'hello' })),
    validateCapabilities: vi.fn(() => true),
    ...overrides,
  };
}

function makeObserver(): ILlmObserver {
  return {
    counter: { record: vi.fn() },
    startSpan: vi.fn(() => ({ id: 'span-1' })),
    endSpan: vi.fn(),
    recordTokenUsage: vi.fn(),
    trace: {},
  };
}

describe('AdapterLlmClient', () => {
  it('returns adapter content on success', async () => {
    const client = new AdapterLlmClient(makeAdapter());
    await expect(client.complete('prompt')).resolves.toBe('hello');
  });

  it('wraps adapter execute() failures in AdapterLlmError with the cause attached', async () => {
    const boom = new Error('socket hang up');
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('socket hang up');
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('wraps transformRequest/transformResponse failures', async () => {
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => { throw new Error('bad payload'); }) }),
    );
    await expect(client.complete('prompt')).rejects.toThrow(AdapterLlmError);
  });

  it('throws AdapterLlmError when content is null instead of returning empty string', async () => {
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => ({ content: null })) }),
    );
    await expect(client.complete('prompt')).rejects.toThrow(/returned no content/);
  });

  it('still returns a legitimately empty string completion', async () => {
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => ({ content: '' })) }),
    );
    await expect(client.complete('prompt')).resolves.toBe('');
  });

  it('ends the observer span with failed status when the adapter errors', async () => {
    const observer = makeObserver();
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw new Error('down'); }) }),
      observer,
    );

    await expect(client.complete('prompt')).rejects.toThrow(AdapterLlmError);
    expect(observer.endSpan).toHaveBeenCalledWith({ id: 'span-1' }, { status: 'failed' });
    expect(observer.recordTokenUsage).not.toHaveBeenCalled();
  });

  it('ends the observer span with completed status and records usage on success', async () => {
    const observer = makeObserver();
    const client = new AdapterLlmClient(makeAdapter(), observer);

    await client.complete('prompt');
    expect(observer.endSpan).toHaveBeenCalledWith({ id: 'span-1' }, { status: 'completed' });
    expect(observer.recordTokenUsage).toHaveBeenCalledTimes(1);
  });
});
