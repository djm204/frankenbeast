# Chunk 2.3: Episodic Recall

**Phase:** 2 — Rewrite franken-brain
**Depends on:** Chunk 2.1 (brain interfaces)
**Estimated size:** Small (~50 lines implementation + tests)

---

## Purpose

Implement the `recall(query, limit?)` method on `IEpisodicMemory`. For v1, this uses keyword matching + recency scoring — no embeddings, no vector DB. Simple and good enough for "what went wrong last time?" queries.

## Implementation

```typescript
// Part of packages/franken-brain/src/sqlite-brain.ts (SqliteEpisodicMemory class)

recall(query: string, limit: number = 10): EpisodicEvent[] {
  // Split query into keywords, filter out stopwords and short terms
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOPWORDS.has(w));

  if (keywords.length === 0) {
    // No meaningful keywords — fall back to most recent
    return this.recent(limit);
  }

  // Build a LIKE clause for each keyword, matching against summary + details
  // Score: number of keyword matches + recency bonus
  const conditions = keywords.map(() =>
    '(LOWER(summary) LIKE ? OR LOWER(COALESCE(details, \'\')) LIKE ?)'
  ).join(' OR ');

  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  const sql = `
    SELECT *,
      (${keywords.map(() =>
        '(CASE WHEN LOWER(summary) LIKE ? THEN 1 ELSE 0 END + CASE WHEN LOWER(COALESCE(details, \'\')) LIKE ? THEN 1 ELSE 0 END)'
      ).join(' + ')}) AS relevance_score
    FROM episodic_events
    WHERE ${conditions}
    ORDER BY relevance_score DESC, created_at DESC
    LIMIT ?
  `;

  const scoringParams = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
  const allParams = [...scoringParams, ...params, limit];

  const rows = this.db.prepare(sql).all(...allParams);
  return rows.map(this.rowToEvent);
}
```

### Stopwords

A minimal set — common English words that don't help search:
```typescript
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'not', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'of', 'by', 'with', 'from', 'as',
  'into', 'about', 'between', 'through', 'after', 'before',
  'this', 'that', 'these', 'those', 'it', 'its',
]);
```

### Future: Embedding-based recall

The `embedding` column in `episodic_events` is nullable and unused in v1. Future enhancement:
1. Add a vector similarity function (cosine distance)
2. Generate embeddings on `record()` using a small local model or API call
3. `recall()` computes query embedding, then uses vector similarity instead of keyword matching
4. The column is already in the schema — no migration needed

## Tests

```typescript
// packages/franken-brain/tests/unit/episodic-recall.test.ts

describe('EpisodicMemory.recall()', () => {
  let brain: SqliteBrain;

  beforeEach(() => {
    brain = new SqliteBrain(); // in-memory
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
    expect(results[0].summary).toContain('auth');
    expect(results[0].summary).toContain('module');
  });

  it('falls back to recent when query has only stopwords', () => {
    const results = brain.episodic.recall('the is a');
    expect(results.length).toBe(5); // all events, most recent first
    expect(results[0].summary).toContain('Rate limit');
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
});
```

## Files

- **Modify:** `packages/franken-brain/src/sqlite-brain.ts` — add `recall()` implementation to `SqliteEpisodicMemory`
- **Add:** `packages/franken-brain/tests/unit/episodic-recall.test.ts`

## Exit Criteria

- `recall(query)` returns relevant events ranked by keyword match count + recency
- Stopwords are filtered out of queries
- Empty/stopword-only queries fall back to most recent events
- `limit` parameter is respected
- Both `summary` and `details` fields are searched
- Tests cover: keyword matching, relevance ranking, stopword handling, limit, empty results, details search
