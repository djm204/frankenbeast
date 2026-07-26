import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BrainVitalsRunDetail,
  BrainVitalsSnapshot,
  DashboardApiClient,
} from '../../lib/dashboard-api';
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
  afterEach(cleanup);

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
});
