import { describe, it, expect } from 'vitest';
import type { BrainSnapshot } from '@franken/types';
import { formatHandoff } from '../../../src/providers/format-handoff.js';

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
});
