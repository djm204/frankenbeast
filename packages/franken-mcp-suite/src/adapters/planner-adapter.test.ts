import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createPlannerAdapter } from './planner-adapter.js';

async function withTempDb<T>(fn: (dbPath: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'fbeast-planner-'));
  try {
    return await fn(join(dir, 'beast.db'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function replaceStoredDag(dbPath: string, planId: string, dag: string): void {
  const db = new Database(dbPath);
  try {
    db.prepare('UPDATE plans SET dag = ? WHERE id = ?').run(dag, planId);
  } finally {
    db.close();
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

  it('returns a deterministic corrupt-plan status for malformed stored JSON', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(dbPath, planId, '{bad json');

    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'corrupt',
      reason: expect.stringMatching(/not valid JSON/i),
    });
    await expect(adapter.validate(planId)).resolves.toEqual({
      verdict: 'invalid',
      issues: [expect.stringMatching(/invalid\/corrupt.*not valid JSON/i)],
    });
  }));

  it.each([
    ['missing tasks', { objective: 'ship' }, /tasks must be an array/i],
    ['non-array tasks', { objective: 'ship', constraints: null, tasks: null }, /tasks must be an array/i],
    ['malformed dependency array', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: 't0', status: 'pending' }] }, /deps must be an array of strings/i],
    ['malformed status', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: [], status: 'blocked' }] }, /status must be pending or done/i],
    ['duplicate task ids', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: [], status: 'pending' }, { id: 't1', title: 'again', deps: [], status: 'pending' }] }, /duplicate task id: t1/i],
  ])('returns invalid instead of throwing for %s in stored planner DAGs', async (_name, dag, reasonPattern) => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(dbPath, planId, JSON.stringify(dag));

    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'corrupt',
      reason: expect.stringMatching(reasonPattern),
    });
    await expect(adapter.validate(planId)).resolves.toMatchObject({
      verdict: 'invalid',
      issues: [expect.stringMatching(reasonPattern)],
    });
  }));

  it('accepts valid stored DAGs whose dependencies appear later in the task list', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(dbPath, planId, JSON.stringify({
      objective: 'ship',
      constraints: null,
      tasks: [
        { id: 't1', title: 'first', deps: ['t2'], status: 'pending' },
        { id: 't2', title: 'second', deps: [], status: 'pending' },
      ],
    }));

    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'found',
      mermaid: expect.stringContaining('t2 --> t1'),
    });
    await expect(adapter.validate(planId)).resolves.toEqual({
      verdict: 'valid',
      issues: [],
    });
  }));

  it('reports dependency cycles as invalid without throwing', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(dbPath, planId, JSON.stringify({
      objective: 'ship',
      constraints: null,
      tasks: [
        { id: 't1', title: 'first', deps: ['t2'], status: 'pending' },
        { id: 't2', title: 'second', deps: ['t1'], status: 'pending' },
      ],
    }));

    await expect(adapter.validate(planId)).resolves.toEqual({
      verdict: 'invalid',
      issues: ['Cycle detected in task dependencies'],
    });
  }));

  it('keeps valid status and validation behavior unchanged', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });

    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'found',
      mermaid: expect.stringContaining('graph TD'),
    });
    await expect(adapter.validate(planId)).resolves.toEqual({
      verdict: 'valid',
      issues: [],
    });
  }));
});
