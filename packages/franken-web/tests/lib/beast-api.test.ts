import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeastApiClient, BeastApiError } from '../../src/lib/beast-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('BeastApiClient', () => {
  const client = new BeastApiClient('http://localhost:3000');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the Beast catalog without browser operator auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: 'martin-loop', label: 'Martin Loop', interviewPrompts: [] },
        ],
      }),
    });

    const catalog = await client.getCatalog();
    expect(catalog[0]?.id).toBe('martin-loop');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/beasts/catalog',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('creates tracked agents and loads tracked agent detail', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'agent-1',
          status: 'initializing',
        },
      }),
    });

    await client.createAgent({
      definitionId: 'chunk-plan',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
    });
    await client.listAgents();
    await client.getAgent('agent-1');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/beasts/agents',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          definitionId: 'chunk-plan',
          initAction: {
            kind: 'chunk-plan',
            command: '/plan --design-doc docs/plans/design.md',
            config: { designDocPath: 'docs/plans/design.md' },
            chatSessionId: 'sess-1',
          },
          initConfig: { designDocPath: 'docs/plans/design.md' },
          chatSessionId: 'sess-1',
        }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/beasts/agents',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/v1/beasts/agents/agent-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects createAgent when the API reports an auto-dispatch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        error: {
          code: 'AGENT_DISPATCH_FAILED',
          message: "Dispatch failed for tracked agent 'agent-1': Invalid chunk-plan config: outputDir is required",
          details: {
            agentId: 'agent-1',
            dispatchError: 'Invalid chunk-plan config: outputDir is required',
          },
        },
      }),
    });

    const errorPromise = client.createAgent({
      definitionId: 'chunk-plan',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
      },
      initConfig: { designDocPath: 'docs/plans/design.md' },
    });

    await expect(errorPromise).rejects.toThrow(
      "Dispatch failed for tracked agent 'agent-1': Invalid chunk-plan config: outputDir is required (HTTP 409, AGENT_DISPATCH_FAILED)",
    );
    await expect(errorPromise).rejects.toMatchObject({
      name: 'BeastApiError',
      status: 409,
      code: 'AGENT_DISPATCH_FAILED',
      details: {
        agentId: 'agent-1',
        dispatchError: 'Invalid chunk-plan config: outputDir is required',
      },
    });
  });

  it('controls existing beast runs once dispatch has happened', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'run-1',
          status: 'running',
        },
      }),
    });

    await client.stopRun('run-1');
    await client.killRun('run-1');
    await client.restartRun('run-1');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/beasts/runs/run-1/stop',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/beasts/runs/run-1/kill',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/v1/beasts/runs/run-1/restart',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('resumes a tracked agent through the agent-specific endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'run-1',
          status: 'running',
          attemptCount: 2,
        },
      }),
    });

    await client.resumeAgent('agent-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/beasts/agents/agent-1/resume',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('controls tracked agents through the agent-specific endpoints', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'agent-1',
          status: 'stopped',
        },
      }),
    });

    await client.startAgent('agent-1');
    await client.stopAgent('agent-1');
    await client.restartAgent('agent-1');
    await client.deleteAgent('agent-1');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/beasts/agents/agent-1/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/beasts/agents/agent-1/stop',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/v1/beasts/agents/agent-1/restart',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/v1/beasts/agents/agent-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('sends agent config patches to the config endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'agent-1',
          moduleConfig: { firewall: false },
        },
      }),
    });

    await client.patchAgentConfig('agent-1', { name: 'Updated', moduleConfig: { firewall: false } });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/beasts/agents/agent-1/config',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated', moduleConfig: { firewall: false } }),
      }),
    );
  });

  it('kills a tracked agent through the agent-specific kill endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          id: 'run-1',
          status: 'stopped',
        },
      }),
    });

    await client.killAgent('agent-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/beasts/agents/agent-1/kill',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces a clear error when killing an agent without a linked run', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        error: {
          code: 'TRACKED_AGENT_NOT_KILLABLE',
          message: "Tracked agent 'agent-1' has no linked run to kill",
        },
      }),
    });

    const errorPromise = client.killAgent('agent-1');

    await expect(errorPromise).rejects.toThrow(
      "Tracked agent 'agent-1' has no linked run to kill (HTTP 409, TRACKED_AGENT_NOT_KILLABLE)",
    );
    await expect(errorPromise).rejects.toMatchObject({
      name: 'BeastApiError',
      status: 409,
      code: 'TRACKED_AGENT_NOT_KILLABLE',
    });
  });

  it('surfaces structured errors for void Beasts API requests', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({
        error: {
          code: 'BEAST_DELETE_UNAVAILABLE',
          message: 'Beast deletion is temporarily unavailable',
          details: { retryAfterMs: 1_000 },
        },
      }),
    });

    const errorPromise = client.deleteAgent('agent-1');

    await expect(errorPromise).rejects.toThrow(
      'Beast deletion is temporarily unavailable (HTTP 503, BEAST_DELETE_UNAVAILABLE)',
    );
    await expect(errorPromise).rejects.toMatchObject({
      name: 'BeastApiError',
      status: 503,
      code: 'BEAST_DELETE_UNAVAILABLE',
      details: { retryAfterMs: 1_000 },
    });
  });

  it('falls back to the HTTP status when Beasts API error bodies are malformed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('not json')),
    });

    const errorPromise = client.killAgent('agent-1');

    await expect(errorPromise).rejects.toThrow('HTTP 502');
    await expect(errorPromise).rejects.toBeInstanceOf(BeastApiError);
  });

  it('opens the ticket-authenticated Beast event stream', async () => {
    const close = vi.fn();
    const listeners: Record<string, (event: { data: string }) => void> = {};
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      Object.assign(this, {
      addEventListener: vi.fn((type: string, handler: (event: { data: string }) => void) => {
        listeners[type] = handler;
      }),
      close,
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ticket: 'sse-ticket' }),
    });

    try {
      const onRunLog = vi.fn();
      const unsubscribe = await client.subscribeToEvents({ runLog: onRunLog });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/v1/beasts/events/ticket',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(new Headers(init.headers).has('authorization')).toBe(false);
      expect(MockEventSource).toHaveBeenCalledWith(
        'http://localhost:3000/v1/beasts/events/stream?ticket=sse-ticket',
      );

      listeners['run.log']?.({ data: JSON.stringify({ runId: 'run-1', stream: 'stdout', line: 'one' }) });
      expect(onRunLog).toHaveBeenCalledWith({ runId: 'run-1', stream: 'stdout', line: 'one' });

      unsubscribe();
      expect(close).toHaveBeenCalled();
    } finally {
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });

  it('attaches the EventSource id to parsed run log events', async () => {
    const close = vi.fn();
    const listeners: Record<string, (event: { data: string; lastEventId?: string }) => void> = {};
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      Object.assign(this, {
      addEventListener: vi.fn((type: string, handler: (event: { data: string; lastEventId?: string }) => void) => {
        listeners[type] = handler;
      }),
      close,
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ticket: 'sse-ticket' }),
    });

    try {
      const onRunLog = vi.fn();
      const unsubscribe = await client.subscribeToEvents({ runLog: onRunLog });

      listeners['run.log']?.({
        data: JSON.stringify({ runId: 'run-1', stream: 'stdout', line: 'one' }),
        lastEventId: 'event-42',
      });
      expect(onRunLog).toHaveBeenCalledWith({
        eventId: 'event-42',
        runId: 'run-1',
        stream: 'stdout',
        line: 'one',
      });

      unsubscribe();
    } finally {
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });

  it('requests a fresh single-use ticket when the Beast event stream disconnects', async () => {
    vi.useFakeTimers();
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const listeners: Array<Record<string, (event: { data: string }) => void>> = [];
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      const instanceListeners: Record<string, (event: { data: string }) => void> = {};
      listeners.push(instanceListeners);
      Object.assign(this, {
        addEventListener: vi.fn((type: string, handler: (event: { data: string }) => void) => {
          instanceListeners[type] = handler;
        }),
        close: listeners.length === 1 ? closeFirst : closeSecond,
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-1' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-2' }) });

    try {
      const onError = vi.fn();
      const unsubscribe = await client.subscribeToEvents({ error: onError });

      listeners[0]?.error?.({ data: '' });
      expect(closeFirst).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('reconnecting') }));

      await vi.advanceTimersByTimeAsync(1_000);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(MockEventSource).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3000/v1/beasts/events/stream?ticket=ticket-2',
      );

      unsubscribe();
      expect(closeSecond).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });

  it('passes the last successfully parsed SSE event id when reconnecting with a fresh ticket', async () => {
    vi.useFakeTimers();
    const listeners: Array<Record<string, (event: { data: string; lastEventId?: string }) => void>> = [];
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      const instanceListeners: Record<string, (event: { data: string; lastEventId?: string }) => void> = {};
      listeners.push(instanceListeners);
      Object.assign(this, {
        addEventListener: vi.fn((type: string, handler: (event: { data: string; lastEventId?: string }) => void) => {
          instanceListeners[type] = handler;
        }),
        close: vi.fn(),
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-1' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-2' }) });

    try {
      const onError = vi.fn();
      const unsubscribe = await client.subscribeToEvents({ runStatus: vi.fn(), runLog: vi.fn(), error: onError });

      listeners[0]?.['run.status']?.({
        data: JSON.stringify({ runId: 'run-1', status: 'running' }),
        lastEventId: '42',
      });
      listeners[0]?.['run.log']?.({
        data: '{malformed-json',
        lastEventId: '43',
      });
      listeners[0]?.error?.({ data: '' });
      await vi.advanceTimersByTimeAsync(1_000);

      expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError));
      expect(MockEventSource).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3000/v1/beasts/events/stream?ticket=ticket-2&lastEventId=42',
      );

      unsubscribe();
    } finally {
      vi.useRealTimers();
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });

  it('retains a parsed SSE event id when its handler throws', async () => {
    vi.useFakeTimers();
    const listeners: Array<Record<string, (event: { data: string; lastEventId?: string }) => void>> = [];
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      const instanceListeners: Record<string, (event: { data: string; lastEventId?: string }) => void> = {};
      listeners.push(instanceListeners);
      Object.assign(this, {
        addEventListener: vi.fn((type: string, handler: (event: { data: string; lastEventId?: string }) => void) => {
          instanceListeners[type] = handler;
        }),
        close: vi.fn(),
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-1' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-2' }) });

    try {
      const handlerError = new Error('consumer failed');
      const onError = vi.fn();
      const unsubscribe = await client.subscribeToEvents({
        runStatus: vi.fn(() => { throw handlerError; }),
        error: onError,
      });

      listeners[0]?.['run.status']?.({
        data: JSON.stringify({ runId: 'run-1', status: 'running' }),
        lastEventId: '44',
      });
      listeners[0]?.error?.({ data: '' });
      await vi.advanceTimersByTimeAsync(1_000);

      expect(onError).toHaveBeenCalledWith(handlerError);
      expect(MockEventSource).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3000/v1/beasts/events/stream?ticket=ticket-2&lastEventId=44',
      );

      unsubscribe();
    } finally {
      vi.useRealTimers();
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });

  it('keeps retrying when a reconnect ticket request fails once', async () => {
    vi.useFakeTimers();
    const listeners: Array<Record<string, (event: { data: string }) => void>> = [];
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      const instanceListeners: Record<string, (event: { data: string }) => void> = {};
      listeners.push(instanceListeners);
      Object.assign(this, {
        addEventListener: vi.fn((type: string, handler: (event: { data: string }) => void) => {
          instanceListeners[type] = handler;
        }),
        close: vi.fn(),
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-1' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: { code: 'UNAVAILABLE' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-3' }) });

    try {
      const onError = vi.fn();
      const unsubscribe = await client.subscribeToEvents({ error: onError });

      listeners[0]?.error?.({ data: '' });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'HTTP 500' }));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(MockEventSource).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3000/v1/beasts/events/stream?ticket=ticket-3',
      );

      unsubscribe();
    } finally {
      vi.useRealTimers();
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });

  it('keeps retrying when the initial ticket request fails', async () => {
    vi.useFakeTimers();
    const MockEventSource = vi.fn(function (this: { addEventListener?: unknown; close?: unknown }) {
      Object.assign(this, {
      addEventListener: vi.fn(),
      close: vi.fn(),
      });
    });
    const originalEventSource = globalThis.EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({ error: { code: 'UNAVAILABLE' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticket: 'ticket-2' }) });

    try {
      const onError = vi.fn();
      const unsubscribe = await client.subscribeToEvents({ error: onError });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'HTTP 503' }));
      expect(MockEventSource).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(MockEventSource).toHaveBeenCalledWith(
        'http://localhost:3000/v1/beasts/events/stream?ticket=ticket-2',
      );

      unsubscribe();
    } finally {
      vi.useRealTimers();
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).EventSource;
      }
    }
  });
});
