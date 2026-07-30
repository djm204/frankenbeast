import { describe, it, expect, vi } from 'vitest';
import { AdapterLlmClient, AdapterLlmError, type IAdapter, type ILlmObserver } from '../../../src/adapters/adapter-llm-client.js';

const { randomUUID } = vi.hoisted(() => ({
  randomUUID: vi.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
}));

vi.mock('node:crypto', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:crypto')>(),
  randomUUID,
}));

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
  it('uses randomUUID for the prefixed request ID and response correlation', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);

    await client.complete('prompt');

    const requestId = 'llm-123e4567-e89b-42d3-a456-426614174000';
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(adapter.transformRequest).toHaveBeenCalledWith(expect.objectContaining({ id: requestId }));
    expect(adapter.transformResponse).toHaveBeenCalledWith({ raw: true }, requestId);
  });

  it('returns adapter content on success', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);
    await expect(client.complete('prompt')).resolves.toBe('hello');
    expect(adapter.transformRequest).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
      timeoutMs: 30_000,
    }));
  });

  it('rejects timeout overrides above the Node timer limit', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);

    await expect(client.complete('prompt', { timeoutMs: 2_147_483_648 })).rejects.toThrow(
      'timeoutMs must be less than or equal to 2147483647',
    );
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it('forwards cancellation and deadline options to the adapter request', async () => {
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);
    const controller = new AbortController();

    await client.complete('prompt', { signal: controller.signal, timeoutMs: 42 });

    expect(adapter.transformRequest).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
      timeoutMs: 42,
    }));
    const transformedRequest = vi.mocked(adapter.transformRequest).mock.calls[0]![0];
    expect(adapter.execute).toHaveBeenCalledWith(
      transformedRequest,
      (transformedRequest as { signal: AbortSignal }).signal,
    );
  });

  it('rejects at the requested deadline and cancels adapter work that would otherwise never settle', async () => {
    vi.useFakeTimers();
    let workCancelled = false;
    const adapter = makeAdapter({
      execute: vi.fn((_request: unknown, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          workCancelled = true;
          reject(signal.reason);
        }, { once: true });
      })),
    });
    const client = new AdapterLlmClient(adapter);

    try {
      const completion = client.complete('prompt', { timeoutMs: 10 })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10);
      const outcome = await completion;

      expect(outcome).toBeInstanceOf(AdapterLlmError);
      expect((outcome as AdapterLlmError).message).toContain('timeout after 10ms');
      expect(workCancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not add a second timer when the adapter manages request deadlines', async () => {
    const adapter = makeAdapter({ managesRequestTimeout: true });
    const client = new AdapterLlmClient(adapter);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    try {
      await client.complete('prompt', { timeoutMs: 42 });
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('preserves a timeout-managing adapter default when no request override is supplied', async () => {
    const adapter = makeAdapter({ managesRequestTimeout: true });
    const client = new AdapterLlmClient(adapter);

    await client.complete('prompt');

    expect(adapter.transformRequest).toHaveBeenCalledWith(
      expect.not.objectContaining({ timeoutMs: expect.anything() }),
    );
  });

  it('does not start adapter work when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancel before start'));
    const adapter = makeAdapter();
    const client = new AdapterLlmClient(adapter);

    await expect(client.complete('prompt', { signal: controller.signal }))
      .rejects.toThrow('cancel before start');
    expect(adapter.transformRequest).not.toHaveBeenCalled();
    expect(adapter.execute).not.toHaveBeenCalled();
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

  it('redacts secrets from outward adapter errors while preserving safe context', async () => {
    const privateMaterial = ['ghp', '1234567890abcdef'].join('_');
    const boom = new Error(`provider unavailable: API_TOKEN=${privateMaterial}`);
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('provider unavailable');
    expect((err as AdapterLlmError).message).toContain('API_TOKEN=<redacted>');
    expect((err as AdapterLlmError).message).not.toContain(privateMaterial);
    expect((err as AdapterLlmError).message).toContain((err as AdapterLlmError).requestId);
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('redacts header-style secrets before normalizing multiline adapter errors', async () => {
    const privateMaterial = ['multiline', 'private', 'material'].join('-');
    const boom = new Error(`API_TOKEN: ${privateMaterial}\n at execute`);
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('API_TOKEN: <redacted>');
    expect((err as AdapterLlmError).message).not.toContain(privateMaterial);
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('redacts header-style secrets before normalizing multiline error names', async () => {
    const privateMaterial = ['multiline', 'class', 'material'].join('-');
    const boom = new Error('provider unavailable');
    boom.name = `API_TOKEN: ${privateMaterial}\n at execute`;
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('API_TOKEN: <redacted>');
    expect((err as AdapterLlmError).message).not.toContain(privateMaterial);
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('preserves the adapter wrapper when reading an error name throws', async () => {
    const boom = new Error('provider unavailable');
    Object.defineProperty(boom, 'name', {
      get: () => { throw new Error('name unavailable'); },
    });
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('Error: provider unavailable');
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('redacts secrets formed by composing the error name and message', async () => {
    const privateMaterial = ['composed', 'private', 'material'].join('-');
    const boom = new Error(privateMaterial);
    boom.name = 'API_TOKEN';
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('API_TOKEN: <redacted>');
    expect((err as AdapterLlmError).message).not.toContain(privateMaterial);
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('preserves the adapter wrapper when error classification throws', async () => {
    const boom = new Proxy(new Error('provider unavailable'), {
      getPrototypeOf: () => { throw new Error('prototype unavailable'); },
    });
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).requestId).toBe('llm-123e4567-e89b-42d3-a456-426614174000');
    expect((err as AdapterLlmError).cause).toBe(boom);
  });

  it('bounds outward adapter diagnostics and identifies the error class', async () => {
    const boom = new TypeError(`invalid response ${'x'.repeat(2_000)}`);
    const client = new AdapterLlmClient(
      makeAdapter({ execute: vi.fn(async () => { throw boom; }) }),
    );

    const err = await client.complete('prompt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterLlmError);
    expect((err as AdapterLlmError).message).toContain('TypeError: invalid response');
    expect((err as AdapterLlmError).message.length).toBeLessThanOrEqual(1_100);
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

  it('cleans up its deadline when observer span creation throws', async () => {
    vi.useFakeTimers();
    try {
      const observer = makeObserver();
      vi.mocked(observer.startSpan).mockImplementation(() => {
        throw new Error('trace ended');
      });
      const client = new AdapterLlmClient(makeAdapter(), observer);

      await expect(client.complete('prompt')).rejects.toThrow('trace ended');

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

  it('forwards provider cache usage when recording observer usage', async () => {
    const observer = makeObserver();
    const usage = {
      inputTokens: 600,
      outputTokens: 100,
      cacheReadTokens: 300,
      cacheCreationTokens: 100,
      cacheCreation1hTokens: 40,
      totalTokens: 1100,
    };
    const client = new AdapterLlmClient(
      makeAdapter({ transformResponse: vi.fn(() => ({ content: 'hi', usage })) }),
      observer,
    );

    await client.complete('prompt');

    expect(observer.recordTokenUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cacheReadTokens: 300,
        cacheCreationTokens: 100,
        cacheCreation1hTokens: 40,
      }),
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
