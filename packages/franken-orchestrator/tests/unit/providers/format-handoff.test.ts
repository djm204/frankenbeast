import { describe, it, expect } from 'vitest';
import type { BrainSnapshot } from '@franken/types';
import {
  assessPmHandoffQuality,
  formatHandoff,
  truncateSnapshot,
} from '../../../src/providers/format-handoff.js';

function makeSnapshot(overrides: Partial<BrainSnapshot> = {}): BrainSnapshot {
  return {
    version: 1,
    timestamp: '2026-03-22T00:00:00.000Z',
    working: { task: 'fix auth' },
    episodic: [
      { type: 'decision', summary: 'Refactor auth module', createdAt: '2026-03-22T00:00:00.000Z' },
    ],
    checkpoint: null,
    metadata: { lastProvider: 'claude-cli', switchReason: 'rate-limit', totalTokensUsed: 5000 },
    ...overrides,
  };
}

describe('formatHandoff', () => {
  it('includes provider metadata', () => {
    const text = formatHandoff(makeSnapshot());
    expect(text).toContain('Previous provider: claude-cli');
    expect(text).toContain('Switch reason: rate-limit');
    expect(text).toContain('Tokens used so far: 5000');
  });

  it('includes working memory as JSON', () => {
    const text = formatHandoff(makeSnapshot({ working: { key: 'val' } }));
    expect(text).toContain('"key": "val"');
  });

  it('includes recent events', () => {
    const text = formatHandoff(makeSnapshot());
    expect(text).toContain('[decision] Refactor auth module');
  });

  it('truncates to last 10 events', () => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      type: 'observation' as const,
      summary: `Event ${i}`,
      createdAt: '2026-03-22T00:00:00.000Z',
    }));
    const text = formatHandoff(makeSnapshot({ episodic: events }));
    expect(text).toContain('Event 5');
    expect(text).toContain('Event 14');
    expect(text).not.toContain('Event 4');
  });

  it('includes checkpoint when present', () => {
    const text = formatHandoff(
      makeSnapshot({
        checkpoint: {
          runId: 'run-1',
          phase: 'execution',
          step: 3,
          context: {},
          timestamp: '2026-03-22T00:00:00.000Z',
        },
      }),
    );
    expect(text).toContain('Last checkpoint: phase=execution, step=3');
  });

  it('omits checkpoint line when null', () => {
    const text = formatHandoff(makeSnapshot({ checkpoint: null }));
    expect(text).not.toContain('Last checkpoint');
  });

  it('wraps in HANDOFF delimiters', () => {
    const text = formatHandoff(makeSnapshot());
    expect(text).toMatch(/^--- BRAIN STATE HANDOFF ---/);
    expect(text).toMatch(/--- END HANDOFF ---$/);
  });

  it('includes the PM handoff quality rubric with operator guidance', () => {
    const text = formatHandoff(
      makeSnapshot({
        working: {
          issue: '#1862 add PM handoff quality rubric',
          status: 'completed docs and implementation',
          verification: 'npm test -- --run tests/unit/providers/format-handoff.test.ts passed',
          blocker: 'needs review before merge PR',
          artifact: 'branch resolve/issue-1862-feat-learning-add-pm-handoff-quality-rubric',
          lesson: 'Future workers can use this rubric before promotion',
        },
      }),
    );

    expect(text).toContain('PM handoff quality rubric: 6/6 (1)');
    expect(text).toContain('Scope and objective: pass');
    expect(text).toContain('Verification evidence: pass');
    expect(text).toContain('PM handoff includes evidence for every rubric criterion.');
  });
});

describe('assessPmHandoffQuality', () => {
  it('scores a complete PM handoff with deterministic evidence for every criterion', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {
          goal: 'Resolve issue #1862 without broadening scope',
          status: 'implementation completed with decisions recorded',
          verificationCommand: 'npm test --workspace @franken/orchestrator -- --run tests/unit/providers/format-handoff.test.ts',
          blocker: 'needs review before merge',
          pr: 'https://github.com/djm204/frankenbeast/pull/9999',
          retrospective: 'lesson captured for PM handoffs',
        },
      }),
    );

    expect(assessment.score).toBe(1);
    expect(assessment.passed).toBe(6);
    expect(assessment.results.every((result) => result.status === 'pass')).toBe(true);
  });

  it('flags sparse handoffs instead of inventing missing evidence', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {},
        episodic: [
          {
            type: 'observation',
            summary: 'Agent said hello',
            createdAt: '2026-03-22T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(assessment.score).toBe(0);
    expect(assessment.results.map((result) => result.status)).toEqual(
      Array.from({ length: 6 }, () => 'needs-attention'),
    );
    expect(assessment.operatorGuidance).toContain('missing one or more rubric criteria');
  });
});

describe('truncateSnapshot', () => {
  it('returns snapshot unchanged when within budget', () => {
    const snapshot = makeSnapshot();
    const truncated = truncateSnapshot(snapshot, 10_000);
    expect(truncated.episodic).toEqual(snapshot.episodic);
    expect(truncated.working).toEqual(snapshot.working);
  });

  it('trims episodic events oldest-first to fit budget', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      type: 'observation' as const,
      summary: `Step ${i}: ${'x'.repeat(200)}`,
      createdAt: '2026-03-22T00:00:00.000Z',
    }));
    const snapshot = makeSnapshot({ episodic: events });
    const truncated = truncateSnapshot(snapshot, 500);

    expect(truncated.episodic.length).toBeLessThan(50);
    // Most recent events are kept
    expect(truncated.episodic[truncated.episodic.length - 1]!.summary).toContain('Step 49');
    // Oldest events are removed
    expect(truncated.episodic[0]!.summary).not.toContain('Step 0');
  });

  it('trims working memory largest-values-first after episodic', () => {
    const snapshot = makeSnapshot({
      episodic: [],
      working: {
        small: 'tiny',
        large: 'x'.repeat(5000),
        medium: 'y'.repeat(500),
      },
    });
    const truncated = truncateSnapshot(snapshot, 500);
    const workingKeys = Object.keys(truncated.working as Record<string, unknown>);

    // Largest value should be removed first
    expect(workingKeys).not.toContain('large');
    // Small values preserved
    expect(workingKeys).toContain('small');
  });

  it('preserves version, metadata, and checkpoint', () => {
    const snapshot = makeSnapshot({
      episodic: Array.from({ length: 100 }, (_, i) => ({
        type: 'observation' as const,
        summary: `Step ${i}: ${'x'.repeat(200)}`,
        createdAt: '2026-03-22T00:00:00.000Z',
      })),
      checkpoint: {
        runId: 'run-1',
        phase: 'execution',
        step: 5,
        context: {},
        timestamp: '2026-03-22T00:00:00.000Z',
      },
    });
    const truncated = truncateSnapshot(snapshot, 500);

    expect(truncated.version).toBe(1);
    expect(truncated.metadata.lastProvider).toBe('claude-cli');
    expect(truncated.checkpoint?.phase).toBe('execution');
  });

  it('does not mutate the original snapshot', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      type: 'observation' as const,
      summary: `Step ${i}: ${'x'.repeat(200)}`,
      createdAt: '2026-03-22T00:00:00.000Z',
    }));
    const snapshot = makeSnapshot({ episodic: events });
    truncateSnapshot(snapshot, 500);

    expect(snapshot.episodic).toHaveLength(50);
  });

  it('produces valid output that formatHandoff can render', () => {
    const snapshot = makeSnapshot({
      episodic: Array.from({ length: 50 }, (_, i) => ({
        type: 'observation' as const,
        summary: `Step ${i}: ${'x'.repeat(200)}`,
        createdAt: '2026-03-22T00:00:00.000Z',
      })),
    });
    const truncated = truncateSnapshot(snapshot, 500);
    const text = formatHandoff(truncated);

    expect(text).toContain('--- BRAIN STATE HANDOFF ---');
    expect(text).toContain('--- END HANDOFF ---');
  });
});
