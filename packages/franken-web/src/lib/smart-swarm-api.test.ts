import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmartSwarmApiClient } from './smart-swarm-api';

const BASE_URL = 'http://localhost:4173';

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('reconnects the live stream with the last real event cursor', async () => {
    vi.useFakeTimers();
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

  it('continues reconnecting after a transient ticket failure', async () => {
    vi.useFakeTimers();
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
    await vi.advanceTimersByTimeAsync(1_000);

    expect(EventSourceMock).toHaveBeenCalledTimes(2);
    unsubscribe();
    vi.useRealTimers();
  });

  it('retries when the initial stream ticket request fails', async () => {
    vi.useFakeTimers();
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    vi.useRealTimers();
  });
});
