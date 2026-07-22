import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteBrain } from '../../src/sqlite-brain.js';

describe('EpisodicMemory.recall()', () => {
  let brain: SqliteBrain;

  beforeEach(() => {
    brain = new SqliteBrain();
    // Seed with diverse events
    brain.episodic.record({ type: 'failure', step: 'build', summary: 'TypeScript compilation failed in auth module', createdAt: '2026-03-18T10:00:00Z' });
    brain.episodic.record({ type: 'success', step: 'test', summary: 'All unit tests passed for auth module', createdAt: '2026-03-18T10:05:00Z' });
    brain.episodic.record({ type: 'failure', step: 'deploy', summary: 'Docker build failed due to missing env var', createdAt: '2026-03-18T10:10:00Z' });
    brain.episodic.record({ type: 'decision', step: 'plan', summary: 'Decided to refactor auth into separate service', createdAt: '2026-03-18T10:15:00Z' });
    brain.episodic.record({ type: 'observation', summary: 'Rate limit hit on Claude API after 50 requests', createdAt: '2026-03-18T10:20:00Z' });
  });

  afterEach(() => brain.close());

  it('finds events matching keyword in summary', () => {
    const results = brain.episodic.recall('auth');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e => e.summary.toLowerCase().includes('auth'))).toBe(true);
  });

  it('ranks by relevance (more keyword matches first)', () => {
    const results = brain.episodic.recall('auth module');
    // Events mentioning both 'auth' and 'module' should rank higher
    expect(results[0]!.summary).toContain('auth');
    expect(results[0]!.summary.toLowerCase()).toContain('module');
  });

  it('falls back to recent when query has only stopwords', () => {
    const results = brain.episodic.recall('the is a');
    expect(results.length).toBe(5); // all events, most recent first
    expect(results[0]!.summary).toContain('Rate limit');
  });

  it('respects limit parameter', () => {
    const results = brain.episodic.recall('auth', 1);
    expect(results.length).toBe(1);
  });

  it('returns empty array when no matches found', () => {
    const results = brain.episodic.recall('kubernetes deployment');
    expect(results.length).toBe(0);
  });

  it('searches details JSON in addition to summary', () => {
    brain.episodic.record({
      type: 'failure',
      summary: 'Build step failed',
      details: { file: 'auth-middleware.ts', line: 42 },
      createdAt: '2026-03-18T10:25:00Z',
    });
    const results = brain.episodic.recall('middleware');
    expect(results.length).toBeGreaterThan(0);
  });

  it('handles empty query gracefully', () => {
    const results = brain.episodic.recall('');
    expect(results.length).toBe(5); // falls back to recent
  });

  it('is case-insensitive', () => {
    const results = brain.episodic.recall('TYPESCRIPT');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.summary).toContain('TypeScript');
  });

  it('filters short keywords (<=2 chars)', () => {
    // 'on' is too short, 'Claude' should match
    const results = brain.episodic.recall('on Claude');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.summary).toContain('Claude');
  });

  it('breaks relevance ties by recency (most recent first)', () => {
    brain.episodic.record({ type: 'failure', summary: 'auth problem', createdAt: '2026-03-18T09:00:00Z' });
    brain.episodic.record({ type: 'failure', summary: 'auth problem', createdAt: '2026-03-18T11:00:00Z' });
    const results = brain.episodic.recall('auth problem');
    // Both have same relevance; the 11:00 one should come first
    expect(results[0]!.createdAt).toBe('2026-03-18T11:00:00Z');
  });

  it('normalizes surrounding punctuation before ranking keyword matches', () => {
    brain.episodic.record({
      type: 'failure',
      summary: 'error timeout',
      createdAt: '2026-03-18T10:30:00Z',
    });
    brain.episodic.record({
      type: 'failure',
      summary: 'timeout',
      createdAt: '2026-03-18T10:31:00Z',
    });

    const results = brain.episodic.recall('error: timeout');

    expect(results[0]!.summary).toBe('error timeout');
  });

  it('normalizes quotes before applying stopword filtering', () => {
    const results = brain.episodic.recall('"the"');

    expect(results).toHaveLength(5);
    expect(results[0]!.summary).toContain('Rate limit');
  });

  it('normalizes punctuation for encrypted episodic recall', () => {
    const encryptedBrain = new SqliteBrain(':memory:', undefined, {
      encryption: { enabled: true, key: 'episodic-recall-test-key' },
    });
    try {
      encryptedBrain.episodic.record({
        type: 'failure',
        summary: 'error timeout',
        createdAt: '2026-03-18T10:30:00Z',
      });

      expect(encryptedBrain.episodic.recall('error: unavailable')).toHaveLength(1);
    } finally {
      encryptedBrain.close();
    }
  });

  it.each([
    ['C++', 'C++ compiler selected', 'compiler selected'],
    ['C#', 'C# compiler selected', 'compiler selected'],
    ['F#', 'F# compiler selected', 'compiler selected'],
    ['.env', '.env file missing', 'env file missing'],
    ['--dry-run', '--dry-run enabled', 'dry-run enabled'],
    ['/app/src/auth.ts', '/app/src/auth.ts failed', 'app/src/auth.ts failed'],
    ['[P1]', '[P1] incident', 'incident'],
    ['[CI]', '[CI] failed', 'CI failed'],
    ['<T>', '<T> generic type', 'generic type'],
    ['<init>', '<init> method failed', 'init method failed'],
    ['!important', '!important declaration', 'important declaration'],
  ])('preserves significant punctuation in %s recall terms', (query, exactSummary, distractorSummary) => {
    brain.episodic.record({
      type: 'observation',
      summary: exactSummary,
      createdAt: '2026-03-18T10:30:00Z',
    });
    brain.episodic.record({
      type: 'observation',
      summary: distractorSummary,
      createdAt: '2026-03-18T10:31:00Z',
    });

    const results = brain.episodic.recall(query);

    expect(results[0]!.summary).toBe(exactSummary);
  });

  it('does not turn punctuation-only queries into recent-memory reads', () => {
    expect(brain.episodic.recall('???')).toEqual([]);
  });

  it.each([
    ['percent', '100%', '100% completion rate achieved', '100 percent complete'],
    ['underscore', 'token_ab', 'token_ab accepted', 'tokenXab accepted'],
    ['backslash', String.raw`C:\\temp`, String.raw`C:\\temp created`, 'C:temp created'],
  ])('escapes LIKE %s characters in query', (_name, query, exactSummary, distractorSummary) => {
    brain.episodic.record({
      type: 'observation',
      summary: exactSummary,
      createdAt: '2026-03-18T10:30:00Z',
    });
    brain.episodic.record({
      type: 'observation',
      summary: distractorSummary,
      createdAt: '2026-03-18T10:31:00Z',
    });

    const results = brain.episodic.recall(query);

    expect(results.map((event) => event.summary)).toEqual([exactSummary]);
  });
});
