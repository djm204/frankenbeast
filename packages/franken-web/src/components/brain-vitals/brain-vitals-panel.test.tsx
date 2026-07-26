import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BrainVitalsRunDetail,
  BrainVitalsSnapshot,
  DashboardApiClient,
} from '../../lib/dashboard-api';
import type { BrainVitalsActivity } from '../../lib/brain-vitals-api';
import { BrainVitalsPanel } from './brain-vitals-panel';

const snapshot: BrainVitalsSnapshot = {
  brainId: 'reviewer',
  window: { since: 1, before: 2, windowMs: 3_600_000 },
  health: {
    brainId: 'reviewer',
    score: 88,
    timestamp: 2,
    signals: {
      taskSuccessRate: 1,
      cacheHitRatio: 0.25,
      compactionPressure: 0.1,
      churnRatio: 0,
      resourcePressure: 0.25,
      budgetBurnRatio: 0.1,
    },
    weights: {
      taskSuccessRate: 0.3,
      cacheHitRatio: 0.15,
      compactionPressure: 0.15,
      churnRatio: 0.15,
      resourcePressure: 0.1,
      budgetBurnRatio: 0.15,
    },
  },
  cache: { hitRatio: 0.25, promptTokens: 800, cacheReadTokens: 200, cacheCreationTokens: 0 },
  compaction: { count: 1, perHour: 1, latestAt: 1 },
  churn: {
    spawnCount: 1,
    spawnRatePerMinute: 0.02,
    completed: 1,
    failed: 0,
    stopped: 0,
    active: 0,
    orphaned: 0,
    ratio: 0,
    runDurationMs: { count: 1, p50: 1000, p95: 1000, min: 1000, max: 1000 },
  },
  resource: {
    availability: 'available',
    latest: {
      agentId: 'reviewer-agent',
      runId: 'run-1',
      pid: 42,
      cpuPercent: 25,
      rssBytes: 134_217_728,
      estimatedWatts: 26.25,
      estimatedEnergyWh: 0.05,
      timestamp: 2,
    },
    sampleCount: 1,
    estimatedEnergyWh: 0.05,
  },
  cost: { estimatedUsd: 0.02, budgetUsd: 2, burnRatio: 0.01 },
};

const detail: BrainVitalsRunDetail = {
  run: {
    id: 'run-1',
    definitionId: 'reviewer',
    status: 'completed',
    executionMode: 'process',
    dispatchedBy: 'dashboard',
    dispatchedByUser: 'operator',
    attemptCount: 1,
    createdAt: '2026-07-26T06:00:00.000Z',
  },
  churn: { classification: 'completed' },
  tokens: {
    promptTokens: 800,
    completionTokens: 200,
    cacheReadTokens: 200,
    cacheCreationTokens: 0,
    totalTokens: 1_200,
    cacheHitRatio: 0.25,
    estimatedUsd: 0.02,
  },
  cost: { estimatedUsd: 0.02, budgetUsd: 2, burnRatio: 0.01 },
  compactions: [{
    sessionId: 'run-1',
    runId: 'run-1',
    generation: 1,
    triggerReason: 'threshold',
    tokensBefore: 4_000,
    tokensAfter: 1_000,
    timestamp: 2,
  }],
  resources: [snapshot.resource.latest!],
  events: [],
  eventsTruncated: false,
};

function client(overrides: Partial<DashboardApiClient> = {}): DashboardApiClient {
  return {
    listBrainVitalsRuns: vi.fn().mockResolvedValue({ runs: [detail.run] }),
    fetchBrainVitalsSnapshot: vi.fn().mockResolvedValue(snapshot),
    fetchBrainVitalsHistory: vi.fn().mockResolvedValue({ data: [snapshot.health], window: snapshot.window }),
    fetchBrainVitalsRun: vi.fn().mockResolvedValue(detail),
    subscribeToBrainVitals: vi.fn().mockResolvedValue(() => undefined),
    ...overrides,
  } as unknown as DashboardApiClient;
}

describe('BrainVitalsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders real aggregate vitals, updates a graph from SSE, and drills into a real run', async () => {
    let pushSnapshot!: (next: BrainVitalsSnapshot) => void;
    const api = client({
      subscribeToBrainVitals: vi.fn((_brainId, onSnapshot) => {
        pushSnapshot = onSnapshot;
        return Promise.resolve(() => undefined);
      }),
    });

    render(<BrainVitalsPanel client={api} />);

    expect(await screen.findByRole('region', { name: 'Brain Vitals for reviewer' })).toBeTruthy();
    expect(await screen.findByLabelText('Health score 88')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByLabelText('Resource usage trend').getAttribute('data-point-count')).toBe('1');
    expect(screen.getByLabelText('Cost trend').getAttribute('data-point-count')).toBe('1');

    pushSnapshot({
      ...snapshot,
      resource: {
        ...snapshot.resource,
        latest: { ...snapshot.resource.latest!, cpuPercent: 40, timestamp: 3 },
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Resource usage trend').getAttribute('data-point-count')).toBe('2');
      expect(screen.getByText(/40% CPU/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Open vitals for run run-1/ }));

    expect(await screen.findByRole('dialog', { name: 'Run run-1 vitals' })).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('1 compaction')).toBeTruthy();
    expect(screen.getByText(/128 MB peak RSS/)).toBeTruthy();
    expect(api.fetchBrainVitalsRun).toHaveBeenCalledWith('reviewer', 'run-1');
  });

  it('offers a selector when multiple brain definitions have runs', async () => {
    const api = client({
      listBrainVitalsRuns: vi.fn().mockResolvedValue({
        runs: [
          detail.run,
          { ...detail.run, id: 'run-2', definitionId: 'planner' },
        ],
      }),
    });

    render(<BrainVitalsPanel client={api} />);

    const selector = await screen.findByLabelText('Brain');
    expect(selector).toBeTruthy();
    fireEvent.change(selector, { target: { value: 'planner' } });

    await waitFor(() => {
      expect(api.fetchBrainVitalsSnapshot).toHaveBeenCalledWith('planner');
      expect(api.subscribeToBrainVitals).toHaveBeenCalledWith('planner', expect.any(Function), expect.any(Function), expect.any(Function));
    });
  });

  it('does not misreport missing per-run resource telemetry as measured zero usage', async () => {
    const api = client({
      fetchBrainVitalsRun: vi.fn().mockResolvedValue({ ...detail, resources: [] }),
    });
    render(<BrainVitalsPanel client={api} />);

    fireEvent.click(await screen.findByRole('button', { name: /Open vitals for run run-1/ }));

    expect(await screen.findByText('Resource telemetry unavailable')).toBeTruthy();
  });

  it('discovers the first run after an initially empty result without a remount', async () => {
    let poll: (() => void) | undefined;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, timeout) => {
      if (timeout === 10_000) poll = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const plannerRun = { ...detail.run, id: 'run-2', definitionId: 'planner' };
    const listBrainVitalsRuns = vi.fn()
      .mockResolvedValueOnce({ runs: [] })
      .mockResolvedValueOnce({ runs: [detail.run], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ runs: [plannerRun] });
    const api = client({ listBrainVitalsRuns });
    render(<BrainVitalsPanel client={api} />);

    expect(await screen.findByText(/No Beast runs exist yet/)).toBeTruthy();
    await act(async () => {
      poll?.();
      await Promise.resolve();
    });

    expect(await screen.findByRole('region', { name: 'Brain Vitals for planner' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'reviewer' })).toBeTruthy();
    expect(listBrainVitalsRuns).toHaveBeenLastCalledWith(100, 'page-2');
  });

  it('discovers paginated runs one bounded page per refresh and preserves earlier pages', async () => {
    let poll: (() => void) | undefined;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, timeout) => {
      if (timeout === 10_000) poll = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const plannerRun = { ...detail.run, id: 'run-2', definitionId: 'planner' };
    const listBrainVitalsRuns = vi.fn()
      .mockResolvedValueOnce({ runs: [detail.run], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ runs: [plannerRun] });
    render(<BrainVitalsPanel client={client({ listBrainVitalsRuns })} />);

    expect(await screen.findByRole('region', { name: 'Brain Vitals for reviewer' })).toBeTruthy();
    expect(listBrainVitalsRuns).toHaveBeenCalledTimes(1);
    expect(listBrainVitalsRuns).toHaveBeenLastCalledWith(100, undefined);

    await act(async () => {
      poll?.();
      await Promise.resolve();
    });

    expect(await screen.findByRole('option', { name: 'planner' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'reviewer' })).toBeTruthy();
    expect(listBrainVitalsRuns).toHaveBeenCalledTimes(3);
    expect(listBrainVitalsRuns).toHaveBeenNthCalledWith(2, 100, undefined);
    expect(listBrainVitalsRuns).toHaveBeenLastCalledWith(100, 'page-2');
  });

  it('retains the newest 500 runs when incrementally paging older history', async () => {
    let poll: (() => void) | undefined;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, timeout) => {
      if (timeout === 10_000) poll = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const pages = Array.from({ length: 6 }, (_, page) => ({
      runs: Array.from({ length: 100 }, (_, index) => {
        const ordinal = page * 100 + index;
        return {
          ...detail.run,
          id: `run-${ordinal}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 600 - ordinal)).toISOString(),
        };
      }),
      ...(page < 5 ? { nextCursor: `page-${page + 2}` } : {}),
    }));
    const listBrainVitalsRuns = vi.fn(async (_limit: number, cursor?: string) => {
      if (!cursor) return pages[0]!;
      return pages[Number(cursor.replace('page-', '')) - 1]!;
    });
    render(<BrainVitalsPanel client={client({ listBrainVitalsRuns })} />);

    expect(await screen.findByRole('button', { name: 'Open vitals for run run-0' })).toBeTruthy();
    for (let page = 1; page < pages.length; page += 1) {
      await act(async () => {
        poll?.();
        await Promise.resolve();
      });
    }

    expect(screen.getByRole('button', { name: 'Open vitals for run run-0' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open vitals for run run-599' })).toBeNull();
  });

  it('refreshes run discovery only for churn activity', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let pushActivity!: (activity: BrainVitalsActivity) => void;
    const listBrainVitalsRuns = vi.fn().mockResolvedValue({ runs: [detail.run] });
    const api = client({
      listBrainVitalsRuns,
      subscribeToBrainVitals: vi.fn((_brainId, _onSnapshot, _onError, onActivity) => {
        pushActivity = onActivity!;
        return Promise.resolve(() => undefined);
      }),
    });
    render(<BrainVitalsPanel client={api} />);
    await waitFor(() => expect(pushActivity).toBeTypeOf('function'));
    expect(listBrainVitalsRuns).toHaveBeenCalledTimes(1);

    act(() => pushActivity({ dimension: 'resource', kind: 'sampled', runId: 'run-1', timestamp: 3 }));
    await Promise.resolve();
    expect(listBrainVitalsRuns).toHaveBeenCalledTimes(1);

    now += 10_001;
    act(() => pushActivity({ dimension: 'churn', kind: 'run.completed', runId: 'run-1', timestamp: 4 }));
    await waitFor(() => expect(listBrainVitalsRuns).toHaveBeenCalledTimes(2));
  });

  it('cycles historical pages so cached run statuses keep updating', async () => {
    let poll: (() => void) | undefined;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, timeout) => {
      if (timeout === 10_000) poll = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const newestRun = { ...detail.run, id: 'run-new' };
    const olderRunning = { ...detail.run, id: 'run-old', status: 'running' as const };
    const olderCompleted = { ...olderRunning, status: 'completed' as const };
    let backfillCount = 0;
    const listBrainVitalsRuns = vi.fn(async (_limit?: number, cursor?: string) => {
      if (!cursor) return { runs: [newestRun], nextCursor: 'page-2' };
      backfillCount += 1;
      return { runs: [backfillCount === 1 ? olderRunning : olderCompleted] };
    });
    render(<BrainVitalsPanel client={client({ listBrainVitalsRuns })} />);
    await screen.findByRole('button', { name: 'Open vitals for run run-new' });

    await act(async () => {
      poll?.();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Open vitals for run run-old' }).closest('li')?.textContent).toContain('running');

    await act(async () => {
      poll?.();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Open vitals for run run-old' }).closest('li')?.textContent).toContain('completed');
  });

  it('clears a recovered run-discovery error', async () => {
    let poll: (() => void) | undefined;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, timeout) => {
      if (timeout === 10_000) poll = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const api = client({
      listBrainVitalsRuns: vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ runs: [detail.run] }),
    });
    render(<BrainVitalsPanel client={api} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to discover Brain Vitals runs');
    await act(async () => {
      poll?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByText(/Unable to discover Brain Vitals runs/)).toBeNull());
    expect(screen.getByRole('region', { name: 'Brain Vitals for reviewer' })).toBeTruthy();
  });

  it('keeps newer SSE state when the initial REST load settles later', async () => {
    let pushSnapshot!: (next: BrainVitalsSnapshot) => void;
    let resolveSnapshot!: (value: BrainVitalsSnapshot) => void;
    let resolveHistory!: (value: { data: []; window: BrainVitalsSnapshot['window'] }) => void;
    const initialSnapshot = new Promise<BrainVitalsSnapshot>((resolve) => { resolveSnapshot = resolve; });
    const initialHistory = new Promise<{ data: []; window: BrainVitalsSnapshot['window'] }>((resolve) => { resolveHistory = resolve; });
    const api = client({
      fetchBrainVitalsSnapshot: vi.fn().mockReturnValue(initialSnapshot),
      fetchBrainVitalsHistory: vi.fn().mockReturnValue(initialHistory),
      subscribeToBrainVitals: vi.fn((_brainId, onSnapshot) => {
        pushSnapshot = onSnapshot;
        return Promise.resolve(() => undefined);
      }),
    });
    render(<BrainVitalsPanel client={api} />);
    await waitFor(() => expect(pushSnapshot).toBeTypeOf('function'));

    act(() => pushSnapshot({
      ...snapshot,
      window: { ...snapshot.window, before: 3 },
      health: { ...snapshot.health, score: 99, timestamp: 3 },
    }));
    expect(await screen.findByLabelText('Health score 99')).toBeTruthy();

    await act(async () => {
      resolveSnapshot(snapshot);
      resolveHistory({ data: [], window: snapshot.window });
      await Promise.all([initialSnapshot, initialHistory]);
    });

    expect(screen.getByLabelText('Health score 99')).toBeTruthy();
  });

  it('preserves a usable current snapshot when history loading fails', async () => {
    render(<BrainVitalsPanel client={client({
      fetchBrainVitalsHistory: vi.fn().mockRejectedValue(new Error('history offline')),
    })} />);

    expect(await screen.findByLabelText('Health score 88')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Unable to load Brain Vitals history for reviewer. history offline');
    expect(screen.getByText('1 persisted/live samples')).toBeTruthy();
  });

  it('recovers from a failed initial REST load when SSE succeeds and preserves missing resources', async () => {
    let pushSnapshot!: (next: BrainVitalsSnapshot) => void;
    const api = client({
      fetchBrainVitalsSnapshot: vi.fn().mockRejectedValue(new Error('REST unavailable')),
      fetchBrainVitalsHistory: vi.fn().mockRejectedValue(new Error('REST unavailable')),
      subscribeToBrainVitals: vi.fn((_brainId, onSnapshot) => {
        pushSnapshot = onSnapshot;
        return Promise.resolve(() => undefined);
      }),
    });
    render(<BrainVitalsPanel client={api} />);
    await waitFor(() => expect(pushSnapshot).toBeTypeOf('function'));

    act(() => pushSnapshot({
      ...snapshot,
      window: { ...snapshot.window, before: 3 },
      health: { ...snapshot.health, score: 91, timestamp: 3 },
      resource: { ...snapshot.resource, availability: 'unavailable', latest: null },
      cost: { ...snapshot.cost, estimatedUsd: 0.03 },
    }));

    expect(await screen.findByLabelText('Health score 91')).toBeTruthy();
    expect(screen.queryByText('Unable to load Brain Vitals for reviewer. REST unavailable')).toBeNull();
    expect(screen.getByText('Unable to load Brain Vitals history for reviewer. REST unavailable')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('Resource telemetry unavailable')).toBeTruthy();
    expect(screen.getByLabelText('Resource usage trend').getAttribute('data-point-count')).toBe('0');
    expect(screen.getByLabelText('Cost trend').getAttribute('data-point-count')).toBe('1');
  });

  it('appends and deduplicates live health and aggregate samples independently of resources', async () => {
    let pushSnapshot!: (next: BrainVitalsSnapshot) => void;
    const api = client({
      subscribeToBrainVitals: vi.fn((_brainId, onSnapshot) => {
        pushSnapshot = onSnapshot;
        return Promise.resolve(() => undefined);
      }),
    });
    render(<BrainVitalsPanel client={api} />);
    expect((await screen.findByLabelText('Health score trend')).getAttribute('data-point-count')).toBe('1');

    act(() => pushSnapshot({
      ...snapshot,
      window: { ...snapshot.window, before: 3 },
      health: { ...snapshot.health, score: 90, timestamp: 3 },
      resource: { ...snapshot.resource, availability: 'unavailable', latest: null },
      cost: { ...snapshot.cost, estimatedUsd: 0.03 },
    }));
    await waitFor(() => {
      expect(screen.getByLabelText('Health score trend').getAttribute('data-point-count')).toBe('2');
      expect(screen.getByLabelText('Resource usage trend').getAttribute('data-point-count')).toBe('1');
      expect(screen.getByLabelText('Cost trend').getAttribute('data-point-count')).toBe('2');
    });

    act(() => pushSnapshot({
      ...snapshot,
      window: { ...snapshot.window, before: 3 },
      health: { ...snapshot.health, score: 92, timestamp: 3 },
      resource: { ...snapshot.resource, availability: 'unavailable', latest: null },
      cost: { ...snapshot.cost, estimatedUsd: 0.04 },
    }));
    await waitFor(() => {
      expect(screen.getByLabelText('Health score trend').getAttribute('data-point-count')).toBe('2');
      expect(screen.getByLabelText('Cost trend').getAttribute('data-point-count')).toBe('2');
    });
  });

  it('plots per-run resource samples from oldest to newest', async () => {
    const api = client({
      fetchBrainVitalsRun: vi.fn().mockResolvedValue({
        ...detail,
        resources: [
          { ...snapshot.resource.latest!, cpuPercent: 80, timestamp: 2 },
          { ...snapshot.resource.latest!, cpuPercent: 20, timestamp: 1 },
        ],
      }),
    });
    render(<BrainVitalsPanel client={api} />);

    fireEvent.click(await screen.findByRole('button', { name: /Open vitals for run run-1/ }));
    const chart = await screen.findByLabelText('Run resource samples');
    expect(chart.querySelector('polyline')?.getAttribute('points')).toBe('0,29.5 100,4');
  });
});
