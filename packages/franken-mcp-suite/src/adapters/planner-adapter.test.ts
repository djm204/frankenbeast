import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** Builds a JSON-valid but arbitrarily deep array literal under an unexpected top-level field. */
function buildDeeplyNestedArrayDag(depth: number): string {
  return `{"objective":"ship","constraints":null,"tasks":[],"deep":${'['.repeat(depth)}${']'.repeat(depth)}}`;
}

describe('createPlannerAdapter', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

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

  it('logs a deterministic error and aborts when stored plan JSON is malformed', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(dbPath, planId, '{bad json');

    await adapter.visualize(planId);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/planner-adapter.*not valid JSON/i));
  }));

  it.each([
    ['missing tasks', { objective: 'ship' }, /tasks must be an array/i],
    ['non-array tasks', { objective: 'ship', constraints: null, tasks: null }, /tasks must be an array/i],
    ['malformed dependency array', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: 't0', status: 'pending' }] }, /deps must be an array of strings/i],
    ['malformed status', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: [], status: 'blocked' }] }, /status must be pending or done/i],
    ['duplicate task ids', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: [], status: 'pending' }, { id: 't1', title: 'again', deps: [], status: 'pending' }] }, /duplicate task id: t1/i],
    ['non-object task entry', { objective: 'ship', constraints: null, tasks: ['not-an-object'] }, /tasks\[0\] must be an object/i],
    ['empty task id', { objective: 'ship', constraints: null, tasks: [{ id: '', title: 'first', deps: [], status: 'pending' }] }, /id must be a non-empty string/i],
    ['non-string title', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 42, deps: [], status: 'pending' }] }, /title must be a string/i],
    ['unexpected top-level field', { objective: 'ship', constraints: null, tasks: [], extra: 'nope' }, /unexpected field.*extra/i],
    ['unexpected field on a task', { objective: 'ship', constraints: null, tasks: [{ id: 't1', title: 'first', deps: [], status: 'pending', extra: 'nope' }] }, /unexpected field.*extra/i],
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

  it('rejects a prototype-pollution-shaped top-level payload without polluting Object.prototype', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    // Written as a raw JSON string (not a JS object literal) so "__proto__"
    // is a genuine own JSON key, matching how JSON.parse would see it if a
    // tampered file or compromised storage row contained this payload.
    replaceStoredDag(
      dbPath,
      planId,
      '{"objective":"ship","constraints":null,"tasks":[],"__proto__":{"polluted":true}}',
    );

    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'corrupt',
      reason: expect.stringMatching(/unsafe key.*__proto__/i),
    });
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  }));

  it('rejects a prototype-pollution-shaped payload nested inside a task without polluting Object.prototype', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(
      dbPath,
      planId,
      '{"objective":"ship","constraints":null,"tasks":[{"id":"t1","title":"first","deps":[],"status":"pending","constructor":{"prototype":{"polluted":true}}}]}',
    );

    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'corrupt',
      reason: expect.stringMatching(/unsafe key.*constructor/i),
    });
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  }));

  it('returns corrupt instead of crashing on a JSON-valid payload deep enough to overflow a recursive scan', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    replaceStoredDag(dbPath, planId, buildDeeplyNestedArrayDag(20000));

    await expect(adapter.visualize(planId)).resolves.toMatchObject({ kind: 'corrupt' });
    await expect(adapter.validate(planId)).resolves.toMatchObject({ verdict: 'invalid' });
  }));

  it('escapes control characters from attacker-controlled text before logging a rejection', async () => withTempDb(async (dbPath) => {
    const adapter = createPlannerAdapter(dbPath);
    const { planId } = await adapter.decompose({ objective: 'ship a memory search feature' });
    // A duplicate task id containing a newline and a CR — if logged verbatim
    // this could forge a fake second stderr line or a fake log entry.
    const maliciousId = 't1\nFAKE LOG LINE: everything is fine\r';
    replaceStoredDag(dbPath, planId, JSON.stringify({
      objective: 'ship',
      constraints: null,
      tasks: [
        { id: maliciousId, title: 'first', deps: [], status: 'pending' },
        { id: maliciousId, title: 'second', deps: [], status: 'pending' },
      ],
    }));

    await adapter.visualize(planId);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect(loggedMessage).not.toContain('\n');
    expect(loggedMessage).not.toContain('\r');
    expect(loggedMessage).toContain('\\x0a');
    expect(loggedMessage).toContain('\\x0d');
    // The structured `reason` returned to callers is unaffected — only the log is sanitized.
    await expect(adapter.visualize(planId)).resolves.toMatchObject({
      kind: 'corrupt',
      reason: expect.stringContaining(maliciousId),
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
