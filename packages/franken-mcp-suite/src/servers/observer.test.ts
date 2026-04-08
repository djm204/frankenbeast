import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createObserverServer } from './observer.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('Observer Server', () => {
  let store: SqliteStore;
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `fbeast-obs-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStore(join(dir, 'beast.db'));
  });

  afterEach(() => {
    store.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes 3 tools', () => {
    const server = createObserverServer(store);
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_observer_log', 'fbeast_observer_cost', 'fbeast_observer_trail']);
  });

  it('log creates audit trail entry and returns id', async () => {
    const server = createObserverServer(store);
    const logTool = server.tools.find((t) => t.name === 'fbeast_observer_log')!;

    const result = await logTool.handler({
      event: 'file_edit',
      metadata: JSON.stringify({ file: 'src/app.ts', lines: '10-20' }),
      sessionId: 'sess-1',
    });

    expect(result.content[0]!.text).toContain('Logged event');
  });

  it('trail returns all events for session', async () => {
    const server = createObserverServer(store);
    const logTool = server.tools.find((t) => t.name === 'fbeast_observer_log')!;
    const trailTool = server.tools.find((t) => t.name === 'fbeast_observer_trail')!;

    await logTool.handler({ event: 'start', metadata: '{}', sessionId: 's1' });
    await logTool.handler({ event: 'edit', metadata: '{"file":"a.ts"}', sessionId: 's1' });
    await logTool.handler({ event: 'other', metadata: '{}', sessionId: 's2' });

    const result = await trailTool.handler({ sessionId: 's1' });
    const text = result.content[0]!.text;
    expect(text).toContain('start');
    expect(text).toContain('edit');
    expect(text).not.toContain('other');
  });

  it('cost tracks token usage per session', async () => {
    const server = createObserverServer(store);
    const costTool = server.tools.find((t) => t.name === 'fbeast_observer_cost')!;

    store.db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run('s1', 'claude-opus-4', 1000, 500, 0.045);

    store.db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run('s1', 'claude-opus-4', 2000, 800, 0.084);

    const result = await costTool.handler({ sessionId: 's1' });
    const text = result.content[0]!.text;
    expect(text).toContain('3000');
    expect(text).toContain('1300');
  });
});
