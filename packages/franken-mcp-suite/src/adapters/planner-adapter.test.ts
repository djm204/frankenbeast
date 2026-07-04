import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlannerAdapter } from './planner-adapter.js';

function withTempDb<T>(fn: (dbPath: string) => Promise<T> | T): Promise<T> | T {
  const dir = mkdtempSync(join(tmpdir(), 'fbeast-planner-'));
  try {
    return fn(join(dir, 'beast.db'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('createPlannerAdapter', () => {
  it('marks built-in plans as generic scaffolds, not generated decompositions', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);

    const result = await adapter.decompose({ objective: 'ship a memory search feature' });

    expect(result.provenance).toBe('generic-scaffold');
    expect(result.provenanceNote).toMatch(/not by an objective-specific planner/i);
    expect(result.tasks.map((task) => task.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
  }));
});
