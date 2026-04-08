import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGovernorServer } from './governor.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('Governor Server', () => {
  let store: SqliteStore;
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `fbeast-gov-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStore(join(dir, 'beast.db'));
  });

  afterEach(() => {
    store.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes 2 tools', () => {
    const server = createGovernorServer(store);
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_governor_check', 'fbeast_governor_budget_status']);
  });

  it('approves safe actions', async () => {
    const server = createGovernorServer(store);
    const checkTool = server.tools.find((t) => t.name === 'fbeast_governor_check')!;

    const result = await checkTool.handler({
      action: 'read_file',
      context: JSON.stringify({ path: 'src/app.ts' }),
    });

    expect(result.content[0]!.text).toContain('approved');
  });

  it('flags destructive actions', async () => {
    const server = createGovernorServer(store);
    const checkTool = server.tools.find((t) => t.name === 'fbeast_governor_check')!;

    const result = await checkTool.handler({
      action: 'delete_database',
      context: JSON.stringify({ table: 'users' }),
    });

    expect(result.content[0]!.text).toContain('review');
  });

  it('logs decisions to governor_log', async () => {
    const server = createGovernorServer(store);
    const checkTool = server.tools.find((t) => t.name === 'fbeast_governor_check')!;

    await checkTool.handler({ action: 'test_action', context: '{}' });

    const row = store.db.prepare(`SELECT * FROM governor_log LIMIT 1`).get() as any;
    expect(row).toBeDefined();
    expect(row.action).toBe('test_action');
  });

  it('budget_status returns spend summary', async () => {
    const server = createGovernorServer(store);
    const budgetTool = server.tools.find((t) => t.name === 'fbeast_governor_budget_status')!;

    store.db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES ('s1', 'claude-opus-4', 5000, 2000, 0.21)
    `).run();

    const result = await budgetTool.handler({});
    expect(result.content[0]!.text).toContain('0.21');
  });
});
