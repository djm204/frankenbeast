import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPlannerServer } from './planner.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('Planner Server', () => {
  let store: SqliteStore;
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `fbeast-plan-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStore(join(dir, 'beast.db'));
  });

  afterEach(() => {
    store.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes 3 tools', () => {
    const server = createPlannerServer(store);
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_plan_decompose', 'fbeast_plan_visualize', 'fbeast_plan_validate']);
  });

  it('decompose creates a plan and returns DAG', async () => {
    const server = createPlannerServer(store);
    const decomposeTool = server.tools.find((t) => t.name === 'fbeast_plan_decompose')!;

    const result = await decomposeTool.handler({
      objective: 'Add user authentication with JWT',
      constraints: 'Must support refresh tokens',
    });

    const text = result.content[0]!.text;
    expect(text).toContain('plan');

    const row = store.db.prepare(`SELECT * FROM plans LIMIT 1`).get();
    expect(row).toBeDefined();
  });

  it('visualize returns mermaid diagram for existing plan', async () => {
    const server = createPlannerServer(store);
    const decomposeTool = server.tools.find((t) => t.name === 'fbeast_plan_decompose')!;
    const vizTool = server.tools.find((t) => t.name === 'fbeast_plan_visualize')!;

    await decomposeTool.handler({ objective: 'Build API' });

    const row = store.db.prepare(`SELECT id FROM plans LIMIT 1`).get() as { id: string };
    const result = await vizTool.handler({ planId: row.id });

    expect(result.content[0]!.text).toContain('graph');
  });

  it('validate detects issues in plan', async () => {
    const server = createPlannerServer(store);
    const decomposeTool = server.tools.find((t) => t.name === 'fbeast_plan_decompose')!;
    const validateTool = server.tools.find((t) => t.name === 'fbeast_plan_validate')!;

    await decomposeTool.handler({ objective: 'Build API' });

    const row = store.db.prepare(`SELECT id FROM plans LIMIT 1`).get() as { id: string };
    const result = await validateTool.handler({ planId: row.id });

    expect(result.content[0]!.text).toContain('valid');
  });
});
