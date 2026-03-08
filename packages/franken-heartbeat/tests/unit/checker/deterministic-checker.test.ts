import { describe, it, expect, vi } from 'vitest';
import { DeterministicChecker } from '../../../src/checker/deterministic-checker.js';
import type { WatchlistItem } from '../../../src/checklist/parser.js';
import type { IObservabilityModule } from '../../../src/modules/observability.js';
import type { Flag } from '../../../src/core/types.js';

function makeObsStub(totalCostUsd = 0): IObservabilityModule {
  return {
    getTraces: vi.fn().mockResolvedValue([]),
    getTokenSpend: vi.fn().mockResolvedValue({
      totalTokens: 0,
      totalCostUsd,
      breakdown: [],
    }),
  };
}

function makeGitExecutor(dirty = false, files: string[] = []): () => Promise<{ dirty: boolean; files: string[] }> {
  return vi.fn().mockResolvedValue({ dirty, files });
}

describe('DeterministicChecker', () => {
  it('returns HEARTBEAT_OK when no flags found', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(),
      gitStatusExecutor: makeGitExecutor(false),
      clock: () => new Date('2026-02-19T14:00:00Z'), // not deep review hour
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const result = await checker.check([]);
    expect(result.status).toBe('HEARTBEAT_OK');
  });

  it('returns FLAGS_FOUND when there are unchecked watchlist items', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(),
      gitStatusExecutor: makeGitExecutor(false),
      clock: () => new Date('2026-02-19T14:00:00Z'),
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const watchlist: WatchlistItem[] = [
      { checked: false, description: 'Pending task' },
    ];

    const result = await checker.check(watchlist);
    expect(result.status).toBe('FLAGS_FOUND');
    if (result.status === 'FLAGS_FOUND') {
      expect(result.flags.some((f) => f.source === 'watchlist')).toBe(true);
    }
  });

  it('returns FLAGS_FOUND when git repo has uncommitted changes', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(),
      gitStatusExecutor: makeGitExecutor(true, ['src/foo.ts']),
      clock: () => new Date('2026-02-19T14:00:00Z'),
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const result = await checker.check([]);
    expect(result.status).toBe('FLAGS_FOUND');
    if (result.status === 'FLAGS_FOUND') {
      expect(result.flags.some((f) => f.source === 'git')).toBe(true);
    }
  });

  it('returns FLAGS_FOUND when token spend exceeds threshold', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(10.0),
      gitStatusExecutor: makeGitExecutor(false),
      clock: () => new Date('2026-02-19T14:00:00Z'),
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const result = await checker.check([]);
    expect(result.status).toBe('FLAGS_FOUND');
    if (result.status === 'FLAGS_FOUND') {
      expect(result.flags.some((f) => f.source === 'token_spend')).toBe(true);
      expect(result.flags.some((f) => f.severity === 'high')).toBe(true);
    }
  });

  it('returns FLAGS_FOUND with deep_review flag at configured hour', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(),
      gitStatusExecutor: makeGitExecutor(false),
      clock: () => new Date('2026-02-19T02:30:00Z'), // UTC hour 2
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const result = await checker.check([]);
    expect(result.status).toBe('FLAGS_FOUND');
    if (result.status === 'FLAGS_FOUND') {
      expect(result.flags.some((f) => f.source === 'deep_review')).toBe(true);
    }
  });

  it('aggregates multiple flags from different sources', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(10.0),
      gitStatusExecutor: makeGitExecutor(true, ['file.ts']),
      clock: () => new Date('2026-02-19T02:00:00Z'),
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const watchlist: WatchlistItem[] = [{ checked: false, description: 'Task' }];
    const result = await checker.check(watchlist);

    expect(result.status).toBe('FLAGS_FOUND');
    if (result.status === 'FLAGS_FOUND') {
      const sources = result.flags.map((f) => f.source);
      expect(sources).toContain('watchlist');
      expect(sources).toContain('git');
      expect(sources).toContain('token_spend');
      expect(sources).toContain('deep_review');
    }
  });

  it('handles git executor failure gracefully', async () => {
    const checker = new DeterministicChecker({
      observability: makeObsStub(),
      gitStatusExecutor: vi.fn().mockRejectedValue(new Error('git not found')),
      clock: () => new Date('2026-02-19T14:00:00Z'),
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const result = await checker.check([]);
    // Should not crash — gracefully returns OK or a warning flag
    expect(result.status).toBe('HEARTBEAT_OK');
  });

  it('handles observability failure gracefully', async () => {
    const obsStub: IObservabilityModule = {
      getTraces: vi.fn().mockRejectedValue(new Error('obs down')),
      getTokenSpend: vi.fn().mockRejectedValue(new Error('obs down')),
    };

    const checker = new DeterministicChecker({
      observability: obsStub,
      gitStatusExecutor: makeGitExecutor(false),
      clock: () => new Date('2026-02-19T14:00:00Z'),
      config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
    });

    const result = await checker.check([]);
    expect(result.status).toBe('HEARTBEAT_OK');
  });
});
