import { describe, it, expect } from 'vitest';
import { partitionForPruning } from '../../../src/working/partition-for-pruning.js';
import type { WorkingTurn } from '../../../src/types/index.js';

function t(id: string, overrides: Partial<WorkingTurn> = {}): WorkingTurn {
  return {
    id,
    type: 'working',
    projectId: 'p',
    status: 'pending',
    createdAt: 0,
    role: 'user',
    content: 'hello',
    tokenCount: 10,
    ...overrides,
  };
}

describe('partitionForPruning', () => {
  it('puts all turns in candidates when none are preserved', () => {
    const turns = [t('A'), t('B'), t('C')];
    const { preserved, candidates } = partitionForPruning(turns);
    expect(preserved).toHaveLength(0);
    expect(candidates).toHaveLength(3);
  });

  it('preserves pinned turns', () => {
    const turns = [t('A', { pinned: true }), t('B'), t('C')];
    const { preserved, candidates } = partitionForPruning(turns);
    expect(preserved.map((x) => x.id)).toEqual(['A']);
    expect(candidates.map((x) => x.id)).toEqual(['B', 'C']);
  });

  it('preserves only the MOST RECENT Plan turn, not earlier ones', () => {
    const turns = [
      t('PLAN1', { role: 'assistant', content: '[Plan] first' }),
      t('MID', { role: 'user', content: 'middle' }),
      t('PLAN2', { role: 'assistant', content: '[Plan] second' }),
      t('AFTER', { role: 'user', content: 'after' }),
    ];
    const { preserved, candidates } = partitionForPruning(turns);
    expect(preserved.map((x) => x.id)).toContain('PLAN2');
    expect(preserved.map((x) => x.id)).not.toContain('PLAN1');
    expect(candidates.map((x) => x.id)).toContain('PLAN1');
  });

  it('preserves only the MOST RECENT tool turn', () => {
    const turns = [
      t('TOOL1', { role: 'tool' }),
      t('MID', { role: 'user', content: 'mid' }),
      t('TOOL2', { role: 'tool' }),
      t('END', { role: 'user', content: 'end' }),
    ];
    const { preserved, candidates } = partitionForPruning(turns);
    expect(preserved.map((x) => x.id)).toContain('TOOL2');
    expect(preserved.map((x) => x.id)).not.toContain('TOOL1');
  });

  it('a single turn can satisfy multiple rules (pinned + Plan)', () => {
    const turns = [t('BOTH', { pinned: true, role: 'assistant', content: '[Plan] pinned plan' })];
    const { preserved, candidates } = partitionForPruning(turns);
    expect(preserved).toHaveLength(1);
    expect(candidates).toHaveLength(0);
  });

  it('preserved turns maintain original insertion order', () => {
    const turns = [
      t('A', { pinned: true }),
      t('B'),
      t('C', { pinned: true }),
      t('D'),
    ];
    const { preserved } = partitionForPruning(turns);
    expect(preserved.map((x) => x.id)).toEqual(['A', 'C']);
  });

  it('returns empty arrays for empty input', () => {
    const { preserved, candidates } = partitionForPruning([]);
    expect(preserved).toHaveLength(0);
    expect(candidates).toHaveLength(0);
  });
});
