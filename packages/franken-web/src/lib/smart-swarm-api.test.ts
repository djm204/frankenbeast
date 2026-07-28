import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmartSwarmApiClient } from './smart-swarm-api';

const BASE_URL = 'http://localhost:4173';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SmartSwarmApiClient', () => {
  it('loads normalized providers and a workspace-scoped snapshot', async () => {
    const provider = {
      id: 'hermes',
      runtime: 'hermes',
      displayName: 'Hermes',
      health: { state: 'connected', checkedAt: '2026-07-26T18:00:00.000Z' },
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'supported' },
        logs: { status: 'supported' },
        blockers: { status: 'supported' },
        approvals: { status: 'supported' },
        pause: { status: 'unsupported', reason: 'Hermes pause is unavailable.' },
        resume: { status: 'unsupported', reason: 'Hermes resume is unavailable.' },
        cancellation: { status: 'unsupported', reason: 'Hermes cancellation is unavailable.' },
        policyActions: { status: 'unsupported', reason: 'Hermes policy actions are unavailable.' },
      },
    } as const;
    const snapshot = {
      providerId: 'hermes',
      state: 'ready',
      capturedAt: '2026-07-26T18:00:01.000Z',
      workspaces: { status: 'available', data: [{ id: 'board/main', name: 'Main', kind: 'board', state: 'available' }] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'available', data: [] },
    } as const;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [provider] }))
      .mockResolvedValueOnce(Response.json({ data: snapshot }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SmartSwarmApiClient(BASE_URL);

    await expect(client.listProviders()).resolves.toEqual([provider]);
    await expect(client.fetchSnapshot('hermes', { workspaceId: 'board/main', activityLimit: 100 })).resolves.toEqual(snapshot);

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${BASE_URL}/v1/smart-swarm/providers`, { method: 'GET' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/v1/smart-swarm/providers/hermes/snapshot?workspaceId=board%2Fmain&activityLimit=100`,
      { method: 'GET' },
    );
  });

  it('rejects malformed runtime events in snapshots before they can pulse', async () => {
    const snapshot = {
      providerId: 'hermes',
      state: 'ready',
      capturedAt: '2026-07-26T18:00:01.000Z',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [{
        id: 'event-1',
        cursor: 'cursor-1',
        workspaceId: 'board-main',
        taskId: null,
        runId: null,
        type: 'log',
        occurredAt: '2026-07-26T18:00:02.000Z',
        summary: 'x'.repeat(16_385),
      }] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'available', data: [] },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: snapshot })));
    const client = new SmartSwarmApiClient(BASE_URL);

    await expect(client.fetchSnapshot('hermes')).rejects.toThrow('Malformed runtime event');
  });

  it('reconnects the live stream with the last real event cursor', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<{
      close: ReturnType<typeof vi.fn>;
      listeners: Record<string, (event: MessageEvent) => void>;
    }> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const source = {
        close: vi.fn(),
        listeners: {} as Record<string, (event: MessageEvent) => void>,
      };
      sources.push(source);
      this.close = source.close;
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        source.listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SmartSwarmApiClient(BASE_URL);
    const event = vi.fn();
    const connection = vi.fn();

    const unsubscribe = await client.subscribe('hermes', 'board/main', { event, connection });
    sources[0]!.listeners.open!(new MessageEvent('open'));
    sources[0]!.listeners.activity!(new MessageEvent('activity', {
      data: JSON.stringify({
        id: 'event-1',
        cursor: 'cursor/1',
        workspaceId: 'board/main',
        taskId: null,
        runId: null,
        type: 'lifecycle',
        occurredAt: '2026-07-26T18:00:02.000Z',
        summary: 'Task started',
      }),
    }));
    sources[0]!.listeners.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(event).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1', cursor: 'cursor/1' }));
    expect(connection).toHaveBeenNthCalledWith(1, 'connected');
    expect(connection).toHaveBeenNthCalledWith(2, 'reconnecting');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(EventSourceMock).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/v1/smart-swarm/providers/hermes/events/stream-2?workspaceId=board%2Fmain&cursor=cursor%2F1`,
      { withCredentials: true },
    );

    unsubscribe();
    expect(sources[1]!.close).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('reconnects the live stream from a cursor-only checkpoint', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<{
      close: ReturnType<typeof vi.fn>;
      listeners: Record<string, (event: MessageEvent) => void>;
    }> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const source = {
        close: vi.fn(),
        listeners: {} as Record<string, (event: MessageEvent) => void>,
      };
      sources.push(source);
      this.close = source.close;
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        source.listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' })));
    const client = new SmartSwarmApiClient(BASE_URL);

    const unsubscribe = await client.subscribe('hermes', 'board/main', { event: vi.fn() });
    sources[0]!.listeners.open!(new MessageEvent('open'));
    const checkpoint = sources[0]!.listeners.checkpoint;
    expect(checkpoint).toBeTypeOf('function');
    checkpoint?.(new MessageEvent('checkpoint', { lastEventId: 'cursor/checkpoint-2' }));
    sources[0]!.listeners.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(EventSourceMock).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/v1/smart-swarm/providers/hermes/events/stream-2?workspaceId=board%2Fmain&cursor=cursor%2Fcheckpoint-2`,
      { withCredentials: true },
    );
    unsubscribe();
  });

  it('rejects oversized checkpoint cursor IDs without replaying them', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' })));
    const error = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn(), error });

    sources[0]!.checkpoint!(new MessageEvent('checkpoint', { lastEventId: 'x'.repeat(4_097) }));
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('checkpoint cursor') }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(EventSourceMock).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/v1/smart-swarm/providers/hermes/events/stream-2`,
      { withCredentials: true },
    );
    unsubscribe();
  });

  it('reconnects after a malformed activity event', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<{ close: ReturnType<typeof vi.fn>; listeners: Record<string, (event: MessageEvent) => void> }> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const source = { close: vi.fn(), listeners: {} as Record<string, (event: MessageEvent) => void> };
      sources.push(source);
      this.close = source.close;
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        source.listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' })));
    const error = vi.fn();
    const connection = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn(), error, connection });

    sources[0]!.listeners.activity!(new MessageEvent('activity', { data: '{bad json' }));

    expect(error).toHaveBeenCalled();
    expect(sources[0]!.close).toHaveBeenCalled();
    expect(connection).toHaveBeenCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(EventSourceMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('rejects structurally malformed runtime events before they can pulse', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<{ close: ReturnType<typeof vi.fn>; listeners: Record<string, (event: MessageEvent) => void> }> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const source = { close: vi.fn(), listeners: {} as Record<string, (event: MessageEvent) => void> };
      sources.push(source);
      this.close = source.close;
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        source.listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' })));
    const event = vi.fn();
    const error = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event, error });

    sources[0]!.listeners.activity!(new MessageEvent('activity', {
      data: JSON.stringify({ id: 'event-1', cursor: 'cursor-1', workspaceId: 'board-main' }),
      lastEventId: 'cursor-1',
    }));

    expect(event).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Malformed runtime event') }));
    expect(sources[0]!.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(EventSourceMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('rejects oversized event fields and nested metadata before they can pulse', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ connectionId: 'stream-1' })));
    const event = vi.fn();
    const error = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event, error });

    sources[0]!.activity!(new MessageEvent('activity', { data: JSON.stringify({
      id: 'event-1',
      cursor: 'cursor-1',
      workspaceId: 'board-main',
      taskId: null,
      runId: null,
      type: 'log',
      occurredAt: '2026-07-26T18:00:02.000Z',
      summary: 'x'.repeat(16_385),
      metadata: { nested: { payload: 'must not reach the UI' } },
    }) }));

    expect(event).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Malformed runtime event') }));
    unsubscribe();
  });

  it('rejects oversized raw activity payloads before parsing them', async () => {
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ connectionId: 'stream-1' })));
    const error = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn(), error });
    const parse = vi.spyOn(JSON, 'parse');

    sources[0]!.activity!(new MessageEvent('activity', { data: `${' '.repeat(262_145)}{}` }));

    expect(parse).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('activity payload') }));
    unsubscribe();
  });

  it('reconnects after a malformed activity event from the last validated cursor', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' })));
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn() });
    sources[0]!.open!(new MessageEvent('open'));
    sources[0]!.checkpoint!(new MessageEvent('checkpoint', { lastEventId: 'validated-checkpoint' }));

    sources[0]!.activity!(new MessageEvent('activity', {
      data: '{bad json',
      lastEventId: 'poisonous-cursor',
    }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(EventSourceMock).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/v1/smart-swarm/providers/hermes/events/stream-2?cursor=validated-checkpoint`,
      { withCredentials: true },
    );
    unsubscribe();
  });

  it('preserves a replay cursor across generic pre-open failures and drops it only after explicit rejection', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    let cursorValidationAttempts = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/events?')) {
        cursorValidationAttempts += 1;
        return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Cursor rejected' } }), {
          status: cursorValidationAttempts === 3 ? 422 : 503,
        }));
      }
      return Promise.resolve(Response.json({ connectionId: `stream-${sources.length + 1}` }));
    }));
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', 'board-main', { event: vi.fn() });
    sources[0]!.open!(new MessageEvent('open'));
    sources[0]!.activity!(new MessageEvent('activity', {
      data: JSON.stringify({
        id: 'event-1',
        cursor: 'replay-cursor',
        workspaceId: 'board-main',
        taskId: null,
        runId: null,
        type: 'lifecycle',
        occurredAt: '2026-07-26T18:00:02.000Z',
        summary: 'Task started',
      }),
    }));
    sources[0]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    sources[1]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(2_000);
    sources[2]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(4_000);

    expect(EventSourceMock).toHaveBeenLastCalledWith(
      `${BASE_URL}/v1/smart-swarm/providers/hermes/events/stream-4?workspaceId=board-main&cursor=replay-cursor`,
      { withCredentials: true },
    );

    sources[3]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(EventSourceMock).toHaveBeenLastCalledWith(
      `${BASE_URL}/v1/smart-swarm/providers/hermes/events/stream-5?workspaceId=board-main`,
      { withCredentials: true },
    );
    unsubscribe();
  });

  it('times out cursor validation so a hung request cannot block reconnection', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    let validationSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/events?')) {
        validationSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(Response.json({ connectionId: `stream-${sources.length + 1}` }));
    }));
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn() });
    sources[0]!.open!(new MessageEvent('open'));
    sources[0]!.activity!(new MessageEvent('activity', { data: JSON.stringify({
      id: 'event-1', cursor: 'replay-cursor', workspaceId: 'board-main', taskId: null, runId: null,
      type: 'log', occurredAt: '2026-07-26T18:00:02.000Z', summary: 'validated',
    }) }));
    sources[0]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    sources[1]!.error!(new MessageEvent('error'));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(validationSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(EventSourceMock).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('aborts an in-flight cursor validation when unsubscribed', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const listeners: Record<string, (event: MessageEvent) => void> = {};
      sources.push(listeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    let validationSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/events?')) {
        validationSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(Response.json({ connectionId: `stream-${sources.length + 1}` }));
    }));
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn() });
    sources[0]!.open!(new MessageEvent('open'));
    sources[0]!.activity!(new MessageEvent('activity', { data: JSON.stringify({
      id: 'event-1', cursor: 'replay-cursor', workspaceId: 'board-main', taskId: null, runId: null,
      type: 'log', occurredAt: '2026-07-26T18:00:02.000Z', summary: 'validated',
    }) }));
    sources[0]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    sources[1]!.error!(new MessageEvent('error'));

    unsubscribe();

    expect(validationSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(EventSourceMock).toHaveBeenCalledTimes(2);
  });

  it('ignores callbacks from an event source superseded by reconnect', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sources: Array<{ close: ReturnType<typeof vi.fn>; listeners: Record<string, (event: MessageEvent) => void> }> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const entry = { close: vi.fn(), listeners: {} as Record<string, (event: MessageEvent) => void> };
      sources.push(entry);
      this.close = entry.close;
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        entry.listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ connectionId: 'stream' }))));
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn() });
    const oldError = sources[0]!.listeners.error!;
    oldError(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);

    oldError(new MessageEvent('error'));
    expect(sources[1]!.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(EventSourceMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('continues reconnecting after a transient ticket failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const listeners: Array<Record<string, (event: MessageEvent) => void>> = [];
    const EventSourceMock = vi.fn(function (this: EventSource) {
      const sourceListeners: Record<string, (event: MessageEvent) => void> = {};
      listeners.push(sourceListeners);
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        sourceListeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Temporary outage' } }), { status: 503 }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-2' })));
    const error = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);

    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn(), error });
    listeners[0]!.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(EventSourceMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(EventSourceMock).toHaveBeenCalledTimes(2);
    unsubscribe();
    vi.useRealTimers();
  });

  it('marks a reconnect unavailable after permanent authentication failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const listeners: Record<string, (event: MessageEvent) => void> = {};
    const EventSourceMock = vi.fn(function (this: EventSource) {
      this.close = vi.fn();
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 })));
    const connection = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);
    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn(), connection });

    listeners.error!(new MessageEvent('error'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(connection).toHaveBeenLastCalledWith('unavailable');
    unsubscribe();
    vi.useRealTimers();
  });

  it('retries when the initial stream ticket request fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const EventSourceMock = vi.fn(function (this: EventSource) {
      this.close = vi.fn();
      this.addEventListener = vi.fn() as EventSource['addEventListener'];
    });
    vi.stubGlobal('EventSource', EventSourceMock);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Temporary outage' } }), { status: 503 }))
      .mockResolvedValueOnce(Response.json({ connectionId: 'stream-1' })));
    const error = vi.fn();
    const connection = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);

    const unsubscribe = await client.subscribe('hermes', 'board-main', {
      event: vi.fn(),
      error,
      connection,
    });

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }));
    expect(connection).toHaveBeenCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(EventSourceMock).toHaveBeenCalledTimes(1);

    unsubscribe();
    vi.useRealTimers();
  });

  it('does not retry permanent stream ticket authentication failures', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const error = vi.fn();
    const connection = vi.fn();
    const client = new SmartSwarmApiClient(BASE_URL);

    const unsubscribe = await client.subscribe('hermes', undefined, { event: vi.fn(), error, connection });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(connection).not.toHaveBeenCalledWith('reconnecting');
    expect(connection).toHaveBeenCalledWith('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    vi.useRealTimers();
  });

  it('submits provider-neutral runtime actions through the authenticated same-origin API', async () => {
    const result = {
      status: 'applied' as const,
      providerId: 'hermes',
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      audit: {
        requestedBy: 'authenticated-operator' as const,
        actionType: 'blocker.resolve' as const,
        targetId: 'hermes:global:t_worker',
        outcome: 'applied' as const,
        previousState: 'blocked',
        currentState: 'ready',
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: result }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SmartSwarmApiClient(BASE_URL);
    const request = {
      correlationId: result.correlationId,
      idempotencyKey: 'blocker.resolve:t_worker:one',
      action: {
        type: 'blocker.resolve' as const,
        workspaceId: 'hermes:global',
        taskId: 'hermes:global:t_worker',
        reason: 'Operator resolved the blocker',
      },
    };

    await expect(client.executeAction('hermes', request)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/v1/smart-swarm/providers/hermes/actions`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
  });
});
