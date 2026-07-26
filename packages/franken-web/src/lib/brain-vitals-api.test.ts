import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrainVitalsApiClient, type BrainVitalsSnapshot } from './brain-vitals-api';

const BASE_URL = 'http://localhost:3737';
const snapshot = {
  brainId: 'reviewer',
  window: { since: 1, before: 2, windowMs: 1 },
} as BrainVitalsSnapshot;

describe('BrainVitalsApiClient', () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEventSource) globalThis.EventSource = originalEventSource;
    else Reflect.deleteProperty(globalThis, 'EventSource');
  });

  it('reads real run, snapshot, history, and per-run route envelopes with encoded IDs', async () => {
    const run = { id: 'run/1', definitionId: 'code/reviewer' };
    const history = { data: [], window: snapshot.window };
    const detail = { run, tokens: { totalTokens: 12 } };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { runs: [run] } }))
      .mockResolvedValueOnce(Response.json({ data: snapshot }))
      .mockResolvedValueOnce(Response.json(history))
      .mockResolvedValueOnce(Response.json({ data: detail }));
    const client = new BrainVitalsApiClient(BASE_URL);

    await expect(client.listRuns()).resolves.toEqual({ runs: [run] });
    await expect(client.fetchSnapshot('code/reviewer')).resolves.toEqual(snapshot);
    await expect(client.fetchHistory('code/reviewer')).resolves.toEqual(history);
    await expect(client.fetchRun('code/reviewer', 'run/1')).resolves.toEqual(detail);

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, `${BASE_URL}/v1/beasts/runs?limit=100`);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, `${BASE_URL}/v1/brain-vitals/code%2Freviewer`);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, `${BASE_URL}/v1/brain-vitals/code%2Freviewer/history?window=1h`);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(4, `${BASE_URL}/v1/brain-vitals/code%2Freviewer/runs/run%2F1`);
  });

  it('mints an HttpOnly-cookie ticket and receives live snapshots without browser-readable credentials', async () => {
    const listeners: Record<string, (event: MessageEvent) => void> = {};
    const close = vi.fn();
    const EventSourceMock = vi.fn(function (this: EventSource) {
      this.addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listener as (event: MessageEvent) => void;
      }) as EventSource['addEventListener'];
      this.close = close;
    });
    Object.assign(globalThis, { EventSource: EventSourceMock });
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json({ connectionId: 'connection/1' }));
    const client = new BrainVitalsApiClient(BASE_URL);
    const onSnapshot = vi.fn();

    const unsubscribe = await client.subscribe('code/reviewer', onSnapshot);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/v1/brain-vitals/code%2Freviewer/events/ticket`,
      { method: 'POST', credentials: 'include' },
    );
    expect(EventSourceMock).toHaveBeenCalledWith(
      `${BASE_URL}/v1/brain-vitals/code%2Freviewer/events/connection%2F1`,
      { withCredentials: true },
    );
    listeners.snapshot!(new MessageEvent('snapshot', { data: JSON.stringify(snapshot) }));
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);

    unsubscribe();
    expect(close).toHaveBeenCalled();
  });
});
