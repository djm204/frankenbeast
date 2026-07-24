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

  it('forwards cancellation and deadline options to the adapter request', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);
    const controller = new AbortController();

    await client.complete('prompt', { signal: controller.signal, timeoutMs: 42 });

    expect(adapter.transformRequest).toHaveBeenCalledWith(expect.objectContaining({
      signal: controller.signal,
      timeoutMs: 42,
    }));
  });

  it('forwards systemPromptAddendum to the adapter request', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);

    await client.complete('prompt', { systemPromptAddendum: 'Runtime status: fallback in effect.' });

    expect(adapter.transformRequest).toHaveBeenCalledWith(expect.objectContaining({
      systemPromptAddendum: 'Runtime status: fallback in effect.',
    }));
  });

  it('omits systemPromptAddendum from the adapter request when not provided', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);

    await client.complete('prompt');

    expect(adapter.transformRequest).toHaveBeenCalledWith(
      expect.not.objectContaining({ systemPromptAddendum: expect.anything() }),
    );
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
    expect(observer.endSpan).toHaveBeenCalledWith({ id: 'span-1' }, { status: 'error' });
    expect(observer.recordTokenUsage).not.toHaveBeenCalled();
  });

  it('ends the observer span with completed status and records usage on success', async () => {
    const observer = makeObserver();
    const client = new AdapterLlmClient(makeAdapter(), observer);

    await client.complete('prompt');
    expect(observer.endSpan).toHaveBeenCalledWith({ id: 'span-1' }, { status: 'completed' });
    expect(observer.recordTokenUsage).toHaveBeenCalledTimes(1);
  });

  it('completeWithUsage returns the adapter-reported usage alongside the text', async () => {
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => ({ content: 'hello', usage })) }),
    );

    await expect(client.completeWithUsage('prompt')).resolves.toEqual({ text: 'hello', usage });
  });

  it('completeWithUsage omits usage when the adapter did not report it', async () => {
    const client = new AdapterLlmClient(makeAdapter());

    await expect(client.completeWithUsage('prompt')).resolves.toEqual({ text: 'hello' });
  });

  it('prefers real adapter usage over the character-count estimate when recording observer usage', async () => {
    const observer = makeObserver();
    const usage = { inputTokens: 999, outputTokens: 999, totalTokens: 1998 };
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => ({ content: 'hi', usage })) }),
      observer,
    );

    await client.complete('prompt');
    expect(observer.recordTokenUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ promptTokens: 999, completionTokens: 999 }),
      expect.anything(),
    );
  });

  it('completeWithUsage returns providerContext when the adapter reports a fallback', async () => {
    const providerContext = { provider: 'claude', switchedFrom: 'codex', switchReason: 'rate_limited' };
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => ({ content: 'hello', providerContext })) }),
    );

    await expect(client.completeWithUsage('prompt')).resolves.toEqual({ text: 'hello', providerContext });
  });

  it('completeWithUsage omits providerContext when the adapter did not report it', async () => {
    const client = new AdapterLlmClient(makeAdapter());

    const result = await client.completeWithUsage('prompt');
    expect(result.providerContext).toBeUndefined();
  });
});
