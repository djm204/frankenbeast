import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HermesRuntimeAdapter } from '../../../src/runtime/hermes/hermes-runtime-adapter.js';
import { RuntimeCursorError, RuntimeSnapshotSchema } from '../../../src/runtime/index.js';

const tempHomes: string[] = [];
const inheritedKanbanDb = process.env['HERMES_KANBAN_DB'];

beforeAll(() => {
  delete process.env['HERMES_KANBAN_DB'];
});

afterAll(() => {
  if (inheritedKanbanDb === undefined) {
    delete process.env['HERMES_KANBAN_DB'];
  } else {
    process.env['HERMES_KANBAN_DB'] = inheritedKanbanDb;
  }
});

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'hermes-runtime-'));
  tempHomes.push(home);
  return home;
}

function createCurrentKanban(path: string): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT,
      status TEXT NOT NULL, priority INTEGER, created_by TEXT, created_at INTEGER NOT NULL,
      started_at INTEGER, completed_at INTEGER, workspace_kind TEXT NOT NULL,
      workspace_path TEXT, branch_name TEXT, result TEXT, last_heartbeat_at INTEGER,
      current_run_id INTEGER, session_id TEXT, block_kind TEXT, provider_override TEXT,
      model_override TEXT
    );
    CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY(parent_id, child_id));
    CREATE TABLE task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, profile TEXT,
      status TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
      outcome TEXT, summary TEXT, metadata TEXT, error TEXT, last_heartbeat_at INTEGER
    );
    CREATE TABLE task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER,
      kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, author TEXT NOT NULL,
      body TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  db.prepare(`INSERT INTO tasks
    (id,title,body,assignee,status,priority,created_by,created_at,started_at,workspace_kind,workspace_path,last_heartbeat_at,current_run_id,session_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    't_parent', 'Provider contract', 'private prompt', 'worker-a', 'running', 1, 'pm',
    1_785_081_600, 1_785_081_610, 'worktree', '/home/private/worktree', 1_785_081_620, 1, 'session-private',
  );
  db.prepare(`INSERT INTO tasks
    (id,title,body,assignee,status,priority,created_by,created_at,started_at,workspace_kind,block_kind)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    't_child', 'Needs input token=secret-value', 'raw environment', 'worker-b', 'blocked', 2, 'pm',
    1_785_081_630, 1_785_081_640, 'scratch', 'needs_input',
  );
  db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)').run('t_parent', 't_child');
  db.prepare(`INSERT INTO task_runs
    (id,task_id,profile,status,started_at,summary,metadata,last_heartbeat_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    1, 't_parent', 'worker-a', 'running', 1_785_081_610,
    'Authorization: Bearer abcdefghijklmnop', '{"provider":"openai","api_key":"secret"}', 1_785_081_620,
  );
  db.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
    10, 't_child', null, 'blocked', '{"reason":"operator input","path":"/home/private"}', 1_785_081_650,
  );
  db.prepare('INSERT INTO task_comments (id,task_id,author,body,created_at) VALUES (?,?,?,?,?)').run(
    20, 't_child', 'worker-b', 'Need API_KEY=super-secret before continuing', 1_785_081_660,
  );
  db.close();
}

describe('HermesRuntimeAdapter', () => {
  it('uses the established HERMES_KANBAN_DB configuration', async () => {
    const home = await createHome();
    const dbPath = join(home, 'configured.db');
    createCurrentKanban(dbPath);

    const snapshot = await new HermesRuntimeAdapter({
      env: { HERMES_KANBAN_DB: dbPath },
    }).getSnapshot();

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'ready',
      tasks: expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:t_parent' })]),
      }),
    }));
  });

  it('uses the standard Hermes home beneath HOME by default', async () => {
    const home = await createHome();
    await mkdir(join(home, '.hermes'), { recursive: true });
    createCurrentKanban(join(home, '.hermes', 'kanban.db'));

    const snapshot = await new HermesRuntimeAdapter({ env: { HOME: home } }).getSnapshot();

    expect(snapshot.state).toBe('ready');
  });

  it('reports missing configuration and incompatible schemas honestly instead of throwing', async () => {
    const unconfigured = new HermesRuntimeAdapter({ env: {} });
    await expect(unconfigured.describe()).resolves.toEqual(
      expect.objectContaining({ health: expect.objectContaining({ state: 'unavailable' }) }),
    );
    await expect(unconfigured.getSnapshot()).resolves.toEqual(
      expect.objectContaining({ state: 'unavailable', tasks: expect.objectContaining({ status: 'unsupported' }) }),
    );

    const home = await createHome();
    const db = new Database(join(home, 'kanban.db'));
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY);');
    db.close();

    const incompatible = new HermesRuntimeAdapter({ hermesHome: home });
    await expect(incompatible.getSnapshot()).resolves.toEqual(expect.objectContaining({
      state: 'schema-incompatible',
      workspaces: expect.objectContaining({
        data: [expect.objectContaining({ id: 'hermes:global', state: 'schema-incompatible' })],
      }),
      tasks: expect.objectContaining({ status: 'unsupported' }),
    }));
  });

  it('reports a configured home without a database as unavailable', async () => {
    const home = await createHome();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'unavailable',
      tasks: expect.objectContaining({ status: 'unsupported' }),
    }));
  });

  it('reports a missing explicitly configured database when another board is healthy', async () => {
    const home = await createHome();
    const boardDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(boardDir, { recursive: true });
    createCurrentKanban(join(boardDir, 'kanban.db'));
    const adapter = new HermesRuntimeAdapter({
      hermesHome: home,
      kanbanDbPath: join(home, 'missing-configured.db'),
    });

    await expect(adapter.describe()).resolves.toEqual(expect.objectContaining({
      health: expect.objectContaining({ state: 'degraded' }),
    }));
    await expect(adapter.getSnapshot()).resolves.toEqual(expect.objectContaining({ state: 'degraded' }));
  });

  it('returns an empty snapshot when a workspace filter matches no discovered source', async () => {
    const home = await createHome();
    createCurrentKanban(join(home, 'kanban.db'));

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({
      workspaceId: 'hermes:missing',
    });

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'empty',
      workspaces: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
    }));
  });

  it('rejects dot-segment scoped workspace names', async () => {
    const home = await createHome();
    const traversedDir = join(home, 'kanban');
    await mkdir(traversedDir, { recursive: true });
    createCurrentKanban(join(traversedDir, 'kanban.db'));

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({
      workspaceId: 'hermes:..',
    });

    expect(snapshot.workspaces).toEqual({ status: 'available', data: [] });
    expect(snapshot.state).toBe('empty');
  });

  it('returns an empty snapshot for a missing workspace when discovered sources are schema-incompatible', async () => {
    const home = await createHome();
    const db = new Database(join(home, 'kanban.db'));
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY);');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home, env: {} }).getSnapshot({
      workspaceId: 'hermes:missing',
    });

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'empty',
      workspaces: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
    }));
  });

  it('supports the canonical schema when optional newer columns and tables are absent', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, assignee TEXT,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, workspace_kind TEXT NOT NULL
      );
      CREATE TABLE task_runs (
        id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, profile TEXT,
        status TEXT NOT NULL, started_at INTEGER NOT NULL
      );
      CREATE TABLE task_events (
        id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      INSERT INTO tasks VALUES ('legacy-task', 'Legacy task', 'legacy-worker', 'todo', 1785078000, 'scratch');
      INSERT INTO task_runs VALUES (1, 'legacy-task', 'legacy-worker', 'pending', 1785078000);
      INSERT INTO task_events VALUES (1, 'legacy-task', 'created', 1785078000);
    `);
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    expect(snapshot).toEqual(expect.objectContaining({
      state: 'ready',
      tasks: expect.objectContaining({ data: [expect.objectContaining({ id: 'hermes:global:legacy-task' })] }),
      runs: expect.objectContaining({
        data: [expect.objectContaining({ id: 'hermes:global:run:1', state: 'queued' })],
      }),
    }));
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
  });

  it('reports unreadable database content as unavailable rather than schema incompatible', async () => {
    const home = await createHome();
    await writeFile(join(home, 'kanban.db'), 'not a sqlite database');

    const adapter = new HermesRuntimeAdapter({ hermesHome: home });
    await expect(adapter.describe()).resolves.toEqual(expect.objectContaining({
      health: expect.objectContaining({ state: 'unavailable' }),
    }));
    await expect(adapter.getSnapshot()).resolves.toEqual(expect.objectContaining({ state: 'unavailable' }));
  });

  it('does not advertise log support when canonical log records are not exposed', async () => {
    const home = await createHome();
    createCurrentKanban(join(home, 'kanban.db'));

    await expect(new HermesRuntimeAdapter({ hermesHome: home }).describe()).resolves.toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          logs: expect.objectContaining({ status: 'unsupported' }),
        }),
      }),
    );
  });

  it('rejects malformed event cursors with the provider-neutral cursor error code', async () => {
    const adapter = new HermesRuntimeAdapter({ env: {} });

    await expect(adapter.getEvents({ cursor: 'malformed' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('rejects event cursors whose timestamp is not a real normalized instant', async () => {
    const cursor = Buffer.from(JSON.stringify({
      occurredAt: 'not-a-date',
      workspaceId: 'hermes:global',
      source: 'event',
      sourceId: 1,
    })).toString('base64url');

    await expect(new HermesRuntimeAdapter({ env: {} }).getEvents({ cursor })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('rejects legacy cursor positions bound to a different workspace', async () => {
    const position = Buffer.from(JSON.stringify({
      occurredAt: '2026-07-26T12:00:00.000Z',
      workspaceId: 'hermes:beta',
      source: 'event',
      sourceId: 1,
    })).toString('base64url');
    const cursor = Buffer.from(JSON.stringify({
      positions: { 'hermes:alpha': position },
    })).toString('base64url');

    await expect(new HermesRuntimeAdapter({ env: {} }).getEvents({ cursor })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('rejects empty workspace IDs in compact and legacy event cursors', () => {
    const occurredAt = '2026-07-26T12:00:00.000Z';
    const cursors = [
      { p: [['', occurredAt, 0, 1]] },
      { p: [['hermes:global', occurredAt, 0, 1, 0, '']] },
      { occurredAt, workspaceId: '', source: 'event', sourceId: 1 },
    ].map((cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url'));
    const adapter = new HermesRuntimeAdapter({ env: {} });

    for (const cursor of cursors) {
      expect(() => adapter.validateEventCursor(cursor)).toThrow(RuntimeCursorError);
    }
  });

  it('rejects oversized event cursors before decoding them', () => {
    const cursor = Buffer.from(JSON.stringify({
      p: [[
        `hermes:${'x'.repeat(13_000)}`,
        '2026-07-26T12:00:00.000Z',
        0,
        1,
      ]],
    })).toString('base64url');

    expect(() => new HermesRuntimeAdapter({ env: {} }).validateEventCursor(cursor))
      .toThrow(RuntimeCursorError);
  });

  it('honors cancellation before starting snapshot and event discovery', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new HermesRuntimeAdapter({ env: {} });

    await expect(adapter.getSnapshot({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(adapter.getEvents({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('assigns distinct workspace IDs to the global database and a board named global', async () => {
    const home = await createHome();
    await mkdir(join(home, 'kanban', 'boards', 'global'), { recursive: true });
    createCurrentKanban(join(home, 'kanban.db'));
    createCurrentKanban(join(home, 'kanban', 'boards', 'global', 'kanban.db'));

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.workspaces.status !== 'available') throw new Error('Expected discovered workspaces');
    const ids = snapshot.workspaces.data.map((workspace) => workspace.id);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('does not rediscover an explicitly configured database as a board', async () => {
    const home = await createHome();
    const boardDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(boardDir, { recursive: true });
    const dbPath = join(boardDir, 'kanban.db');
    createCurrentKanban(dbPath);

    const snapshot = await new HermesRuntimeAdapter({
      hermesHome: home,
      kanbanDbPath: dbPath,
    }).getSnapshot();
    if (snapshot.workspaces.status !== 'available' || snapshot.tasks.status !== 'available') {
      throw new Error('Expected available runtime data');
    }

    expect(snapshot.workspaces.data).toHaveLength(1);
    expect(snapshot.tasks.data.filter((task) => task.id.endsWith(':t_parent'))).toHaveLength(1);
  });

  it('does not expose an explicitly configured board database under a scoped board identity', async () => {
    const home = await createHome();
    const boardDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(boardDir, { recursive: true });
    const dbPath = join(boardDir, 'kanban.db');
    createCurrentKanban(dbPath);
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, kanbanDbPath: dbPath });

    const unscoped = await adapter.getSnapshot();
    const scoped = await adapter.getSnapshot({ workspaceId: 'hermes:alpha' });

    expect(unscoped.workspaces).toEqual(expect.objectContaining({
      data: [expect.objectContaining({ id: 'hermes:global' })],
    }));
    expect(scoped.workspaces).toEqual({ status: 'available', data: [] });
    expect(scoped.state).toBe('empty');
  });

  it('continues returning healthy workspace events when another workspace read fails', async () => {
    const home = await createHome();
    await mkdir(join(home, 'kanban', 'boards', 'alpha'), { recursive: true });
    createCurrentKanban(join(home, 'kanban.db'));
    const boardPath = join(home, 'kanban', 'boards', 'alpha', 'kanban.db');
    createCurrentKanban(boardPath);
    const db = new Database(boardPath);
    db.prepare('UPDATE task_events SET created_at = ?').run('not-a-timestamp');
    db.close();

    const page = await new HermesRuntimeAdapter({ hermesHome: home }).getEvents({ limit: 10 });

    expect(page.events).not.toHaveLength(0);
    expect(page.events.every((event) => event.workspaceId === 'hermes:global')).toBe(true);
    expect(page.nextCursor).not.toBeNull();

    const recovered = new Database(boardPath);
    recovered.prepare('UPDATE task_events SET created_at = ?').run(1_785_081_650);
    recovered.close();
    const replay = await new HermesRuntimeAdapter({ hermesHome: home }).getEvents({
      cursor: page.nextCursor!,
      limit: 10,
    });

    expect(replay.events.some((event) => event.workspaceId === 'hermes:alpha')).toBe(true);
  });

  it('fails event reads when every selected compatible source fails', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE task_events SET created_at = ?').run('not-a-timestamp');
    db.close();

    await expect(new HermesRuntimeAdapter({ hermesHome: home }).getEvents({ limit: 10 }))
      .rejects.toThrow('Every selected Hermes event source failed');
  });

  it('inspects only the selected workspace during workspace-scoped polling', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    const betaDir = join(home, 'kanban', 'boards', 'beta');
    await mkdir(alphaDir, { recursive: true });
    await mkdir(betaDir, { recursive: true });
    createCurrentKanban(join(alphaDir, 'kanban.db'));
    createCurrentKanban(join(betaDir, 'kanban.db'));
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, env: {} });
    const open = vi.spyOn(adapter as unknown as { open(path: string): Database.Database }, 'open');
    const safe = vi.spyOn(
      adapter as unknown as { isSafeDatabase(home: string, path: string): Promise<boolean> },
      'isSafeDatabase',
    );

    await adapter.getEvents({ workspaceId: 'hermes:alpha', limit: 10 });

    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls.every(([path]) => path === join(alphaDir, 'kanban.db'))).toBe(true);
    expect(safe.mock.calls.map(([, path]) => path)).toEqual([join(alphaDir, 'kanban.db')]);
  });

  it('retains cursor positions for discovered workspaces that are temporarily unavailable', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(alphaDir, { recursive: true });
    const globalPath = join(home, 'kanban.db');
    const alphaPath = join(alphaDir, 'kanban.db');
    createCurrentKanban(globalPath);
    createCurrentKanban(alphaPath);
    const adapter = new HermesRuntimeAdapter({ hermesHome: home });
    const first = await adapter.getEvents({ limit: 10 });

    await writeFile(alphaPath, 'temporarily unavailable');
    const globalDb = new Database(globalPath);
    globalDb.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
      11, 't_parent', 1, 'progress', '{}', 1_785_081_700,
    );
    globalDb.close();
    const degraded = await adapter.getEvents({ cursor: first.nextCursor!, limit: 10 });
    const degradedCursor = JSON.parse(Buffer.from(degraded.nextCursor!, 'base64url').toString('utf8')) as {
      p: Array<[string, string, number, number]>;
    };

    expect(degradedCursor.p.map(([workspaceId]) => workspaceId)).toEqual([
      'hermes:alpha',
      'hermes:global',
    ]);

    await rm(alphaPath);
    createCurrentKanban(alphaPath);
    const recovered = await adapter.getEvents({ cursor: degraded.nextCursor!, limit: 10 });
    expect(recovered.events).toEqual([]);
  });

  it('retains a cursor position through one missing database observation', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(alphaDir, { recursive: true });
    const alphaPath = join(alphaDir, 'kanban.db');
    createCurrentKanban(alphaPath);
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, env: {} });
    const first = await adapter.getEvents({ limit: 10 });

    await rm(alphaPath);
    const missing = await adapter.getEvents({ cursor: first.nextCursor!, limit: 1 });

    createCurrentKanban(alphaPath);
    const db = new Database(alphaPath);
    const insert = db.prepare(
      'INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)',
    );
    insert.run(11, 't_parent', 1, 'first-after-replacement', '{}', 1_785_081_670);
    insert.run(12, 't_parent', 1, 'second-after-replacement', '{}', 1_785_081_680);
    insert.run(13, 't_parent', 1, 'third-after-replacement', '{}', 1_785_081_690);
    db.close();

    const recovered = await adapter.getEvents({ cursor: missing.nextCursor!, limit: 1 });

    expect(recovered.events.map((event) => event.id)).toEqual(['hermes:alpha:event:11']);
  });

  it('retains a scoped cursor position through one missing database observation', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(alphaDir, { recursive: true });
    const alphaPath = join(alphaDir, 'kanban.db');
    createCurrentKanban(alphaPath);
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, env: {} });
    const first = await adapter.getEvents({ workspaceId: 'hermes:alpha', limit: 10 });

    await rm(alphaPath);
    const missing = await adapter.getEvents({
      workspaceId: 'hermes:alpha',
      cursor: first.nextCursor!,
      limit: 1,
    });

    createCurrentKanban(alphaPath);
    const db = new Database(alphaPath);
    db.exec('DELETE FROM task_comments; DELETE FROM task_events;');
    const insert = db.prepare(
      'INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)',
    );
    insert.run(11, 't_parent', 1, 'first-after-scoped-outage', '{}', 1_785_081_670);
    insert.run(12, 't_parent', 1, 'second-after-scoped-outage', '{}', 1_785_081_680);
    insert.run(13, 't_parent', 1, 'third-after-scoped-outage', '{}', 1_785_081_690);
    db.close();
    const recovered = await adapter.getEvents({
      workspaceId: 'hermes:alpha',
      cursor: missing.nextCursor!,
      limit: 1,
    });

    expect(recovered.events.map((event) => event.id)).toEqual(['hermes:alpha:event:11']);
  });

  it('seeds initial cursors for healthy workspaces whose older events fall outside the page', async () => {
    const home = await createHome();
    await mkdir(join(home, 'kanban', 'boards', 'alpha'), { recursive: true });
    createCurrentKanban(join(home, 'kanban.db'));
    createCurrentKanban(join(home, 'kanban', 'boards', 'alpha', 'kanban.db'));
    const adapter = new HermesRuntimeAdapter({ hermesHome: home });

    const first = await adapter.getEvents({ limit: 1 });
    const replay = await adapter.getEvents({ cursor: first.nextCursor!, limit: 10 });

    expect(first.events).toHaveLength(1);
    expect(replay.events).toEqual([]);
  });

  it('preserves legacy cursor workspace ordering until each source advances', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(alphaDir, { recursive: true });
    const alphaPath = join(alphaDir, 'kanban.db');
    createCurrentKanban(alphaPath);
    const db = new Database(alphaPath);
    db.exec('DELETE FROM task_comments; DELETE FROM task_events;');
    db.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
      10, 't_parent', 1, 'same-time-before-legacy-workspace', '{}', 1_785_081_650,
    );
    db.close();
    const legacy = Buffer.from(JSON.stringify({
      occurredAt: new Date(1_785_081_650 * 1000).toISOString(),
      workspaceId: 'hermes:global',
      source: 'event',
      sourceId: 1,
    })).toString('base64url');
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, env: {} });

    const first = await adapter.getEvents({ cursor: legacy, limit: 10 });
    const second = await adapter.getEvents({ cursor: first.nextCursor!, limit: 10 });

    expect(first.events).toEqual([]);
    expect(second.events).toEqual([]);
  });

  it('retains a legacy cursor through one missing database observation', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(alphaDir, { recursive: true });
    const alphaPath = join(alphaDir, 'kanban.db');
    createCurrentKanban(alphaPath);
    const legacy = Buffer.from(JSON.stringify({
      occurredAt: new Date(1_785_081_650 * 1000).toISOString(),
      workspaceId: 'hermes:alpha',
      source: 'event',
      sourceId: 10,
    })).toString('base64url');
    await rm(alphaPath);
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, env: {} });

    const missing = await adapter.getEvents({ cursor: legacy, limit: 1 });

    createCurrentKanban(alphaPath);
    const db = new Database(alphaPath);
    db.exec('DELETE FROM task_comments; DELETE FROM task_events;');
    const insert = db.prepare(
      'INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)',
    );
    insert.run(11, 't_parent', 1, 'first-after-outage', '{}', 1_785_081_660);
    insert.run(12, 't_parent', 1, 'second-after-outage', '{}', 1_785_081_670);
    insert.run(13, 't_parent', 1, 'third-after-outage', '{}', 1_785_081_680);
    db.close();
    const recovered = await adapter.getEvents({ cursor: missing.nextCursor!, limit: 1 });

    expect(recovered.events.map((event) => event.id)).toEqual(['hermes:alpha:event:11']);
  });

  it('seeds represented workspaces before their first event in an intermediate cursor', async () => {
    const home = await createHome();
    const alphaDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(alphaDir, { recursive: true });
    const globalPath = join(home, 'kanban.db');
    const alphaPath = join(alphaDir, 'kanban.db');
    createCurrentKanban(globalPath);
    createCurrentKanban(alphaPath);
    const globalDb = new Database(globalPath);
    globalDb.exec('DELETE FROM task_comments; DELETE FROM task_events;');
    globalDb.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
      30, 't_parent', 1, 'global-current', '{}', 1_785_081_700,
    );
    globalDb.close();
    const alphaDb = new Database(alphaPath);
    alphaDb.exec('DELETE FROM task_comments; DELETE FROM task_events;');
    const insertAlpha = alphaDb.prepare(
      'INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)',
    );
    insertAlpha.run(20, 't_parent', 1, 'alpha-old', '{}', 1_785_081_600);
    insertAlpha.run(40, 't_parent', 1, 'alpha-current', '{}', 1_785_081_800);
    alphaDb.close();
    const adapter = new HermesRuntimeAdapter({ hermesHome: home });

    const first = await adapter.getEvents({ limit: 2 });
    const replay = await adapter.getEvents({ cursor: first.events[0]!.cursor, limit: 10 });

    expect(first.events.map((event) => event.id)).toEqual([
      'hermes:global:event:30',
      'hermes:alpha:event:40',
    ]);
    expect(replay.events.map((event) => event.id)).toEqual(['hermes:alpha:event:40']);
  });

  it('drops cursor positions after the missing-workspace grace observation', async () => {
    const home = await createHome();
    const boardDir = join(home, 'kanban', 'boards', 'alpha');
    await mkdir(boardDir, { recursive: true });
    const globalPath = join(home, 'kanban.db');
    createCurrentKanban(globalPath);
    createCurrentKanban(join(boardDir, 'kanban.db'));
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, env: {} });
    const first = await adapter.getEvents({ limit: 10 });

    await rm(boardDir, { recursive: true });
    const missing = await adapter.getEvents({ cursor: first.nextCursor!, limit: 10 });
    const compacted = await adapter.getEvents({ cursor: missing.nextCursor!, limit: 10 });
    const compactedCursor = JSON.parse(Buffer.from(compacted.nextCursor!, 'base64url').toString('utf8')) as {
      p: Array<[string, string, number, number]>;
    };

    expect(compacted.events).toEqual([]);
    expect(compactedCursor.p.map(([workspaceId]) => workspaceId)).toEqual(['hermes:global']);

    const db = new Database(globalPath);
    db.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
      11, 't_parent', 1, 'progress', '{}', 1_785_081_700,
    );
    db.close();
    const replay = await adapter.getEvents({ cursor: compacted.nextCursor!, limit: 10 });
    const decoded = JSON.parse(Buffer.from(replay.nextCursor!, 'base64url').toString('utf8')) as {
      p: Array<[string, string, number, number]>;
    };

    expect(replay.events).toHaveLength(1);
    expect(decoded.p.map(([workspaceId]) => workspaceId)).toEqual(['hermes:global']);
  });

  it('keeps multi-workspace replay cursors below the default HTTP header limit', async () => {
    const home = await createHome();
    for (let index = 0; index < 75; index += 1) {
      const boardDir = join(home, 'kanban', 'boards', `workspace-${String(index).padStart(3, '0')}`);
      await mkdir(boardDir, { recursive: true });
      createCurrentKanban(join(boardDir, 'kanban.db'));
    }

    const page = await new HermesRuntimeAdapter({ hermesHome: home }).getEvents({ limit: 1 });

    expect(page.nextCursor).not.toBeNull();
    expect(page.nextCursor!.length).toBeLessThan(16 * 1024);
  });

  it('rejects workspace sets that cannot fit in a bounded replay cursor', async () => {
    const home = await createHome();
    for (let index = 0; index < 100; index += 1) {
      const boardName = `workspace-${String(index).padStart(3, '0')}-${'x'.repeat(120)}`;
      const boardDir = join(home, 'kanban', 'boards', boardName);
      await mkdir(boardDir, { recursive: true });
      createCurrentKanban(join(boardDir, 'kanban.db'));
    }

    await expect(new HermesRuntimeAdapter({ hermesHome: home }).getEvents({ limit: 1 }))
      .rejects.toThrow('exceeds the supported runtime cursor size');
  });

  it('preserves slash commands and API routes in normalized runtime text', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'Use /plan with /v1/users from /home/alice/private-repo',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'Use /plan with /v1/users from [REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('redacts host paths after key-value delimiters in normalized runtime text', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'workspace=/home/alice/private-repo',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'workspace=[REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('redacts host paths in unquoted application route queries and fragments', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      '/api/tasks?root=/data/private&next=ok',
      't_parent',
    );
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      '/v1/tasks#/srv/private',
      't_child',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: '/api/tasks?root=[REDACTED_HOST_PATH]&next=ok',
      }), expect.objectContaining({
        id: 'hermes:global:t_child',
        title: '/v1/tasks#[REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('redacts unquoted single-component POSIX paths for direct consumers', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run('failed reading /secret', 't_parent');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'failed reading [REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('redacts quoted single-component POSIX, Windows, and UNC paths for direct consumers', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      `failed '/secret' "C:\\private\\file" '\\\\server\\share' "/Users/Alice Smith/John's secret"`,
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: "failed '[REDACTED_HOST_PATH]' \"[REDACTED_HOST_PATH]\" '[REDACTED_HOST_PATH]' \"[REDACTED_HOST_PATH]\"",
      })]),
    }));
  });

  it('redacts host paths encoded as file URLs in normalized runtime text', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'Open file:///home/alice/private-repo/report.txt',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    const serialized = JSON.stringify(snapshot.tasks);

    expect(serialized).not.toContain('/home/alice/private-repo');
    expect(serialized).toContain('[REDACTED_HOST_PATH]');
  });

  it('redacts complete quoted file URL host paths containing spaces', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'Open "file:///Users/alice/Secret Project/config.env"',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'Open "file://[REDACTED_HOST_PATH]"',
      })]),
    }));
  });

  it('preserves delimiters after unquoted file URL host paths', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'See <file:///home/alice/a.txt> now',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'See <file://[REDACTED_HOST_PATH]> now',
      })]),
    }));
  });

  it('redacts host paths enclosed by angle brackets', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'failed at </home/alice/private/config>',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'failed at <[REDACTED_HOST_PATH]>',
      })]),
    }));
  });

  it('redacts host paths after shell redirection delimiters', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'command failed >/home/alice/private/output',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'command failed >[REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('does not treat conjunctions as proof of an API route', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'failed under /home/alice with /v1/private/config',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'failed under [REDACTED_HOST_PATH] with [REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('redacts route-shaped host paths after storage-key delimiters', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run('cwd=/api/private/repo', 't_parent');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'cwd=[REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('redacts host paths wrapped in Markdown backticks for direct consumers', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'read `/home/alice/repo/config.json`',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'read `[REDACTED_HOST_PATH]`',
      })]),
    }));
  });

  it('redacts host paths after punctuation in normalized runtime text', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'failed,/home/alice/private/file',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'failed,[REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('preserves quoted API routes in normalized runtime text', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'Call "/v1/users" after setup',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'Call "/v1/users" after setup',
      })]),
    }));
  });

  it('redacts host paths rooted outside the common allowlist in normalized runtime text', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(
      'failed under /data/hermes/private/file',
      't_parent',
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.tasks).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:t_parent',
        title: 'failed under [REDACTED_HOST_PATH]',
      })]),
    }));
  });

  it('reports mixed unreadable and schema-incompatible sources as unavailable', async () => {
    const home = await createHome();
    const incompatible = new Database(join(home, 'kanban.db'));
    incompatible.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY);');
    incompatible.close();
    await mkdir(join(home, 'kanban', 'boards', 'alpha'), { recursive: true });
    await writeFile(join(home, 'kanban', 'boards', 'alpha', 'kanban.db'), 'not sqlite');

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.state).toBe('unavailable');
    expect(snapshot.tasks.status).toBe('unsupported');
  });

  it('orders equal-timestamp snapshot events by numeric source ID', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('DELETE FROM task_comments').run();
    db.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
      2, 't_child', null, 'updated', '{}', 1_785_081_650,
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({ activityLimit: 2 });
    if (snapshot.events.status !== 'available') throw new Error('Expected events');

    expect(snapshot.events.data.map((event) => event.id)).toEqual([
      'hermes:global:event:2',
      'hermes:global:event:10',
    ]);
  });

  it('orders equal-timestamp snapshot events across workspaces by cursor order', async () => {
    const home = await createHome();
    await mkdir(join(home, 'kanban', 'boards', 'alpha'), { recursive: true });
    const globalPath = join(home, 'kanban.db');
    const alphaPath = join(home, 'kanban', 'boards', 'alpha', 'kanban.db');
    createCurrentKanban(globalPath);
    createCurrentKanban(alphaPath);
    for (const dbPath of [globalPath, alphaPath]) {
      const db = new Database(dbPath);
      db.prepare('DELETE FROM task_comments').run();
      db.close();
    }

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({ activityLimit: 1 });
    if (snapshot.events.status !== 'available') throw new Error('Expected events');

    expect(snapshot.events.data.map((event) => event.id)).toEqual(['hermes:global:event:10']);
  });

  it('uses the latest lifecycle timestamp for completed tasks, runs, and agents', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET status = ?, completed_at = ?, last_heartbeat_at = ? WHERE id = ?')
      .run('done', 1_785_081_900, 1_785_081_620, 't_parent');
    db.prepare('UPDATE task_runs SET status = ?, ended_at = ?, last_heartbeat_at = ? WHERE id = ?')
      .run('done', 1_785_081_900, 1_785_081_620, 1);
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    const expected = new Date(1_785_081_900 * 1000).toISOString();
    if (snapshot.tasks.status !== 'available' || snapshot.runs.status !== 'available'
      || snapshot.agents.status !== 'available') throw new Error('Expected runtime data');

    expect(snapshot.tasks.data.find((task) => task.id.endsWith('t_parent'))?.updatedAt).toBe(expected);
    expect(snapshot.runs.data[0]?.finishedAt).toBe(expected);
    expect(snapshot.agents.data.find((agent) => agent.id.endsWith('worker-a'))?.lastActiveAt).toBe(expected);
  });

  it('normalizes established terminal Kanban task aliases', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('DELETE FROM task_links').run();
    db.prepare('DELETE FROM tasks').run();
    const insert = db.prepare('INSERT INTO tasks (id,title,status,created_at,workspace_kind) VALUES (?,?,?,?,?)');
    for (const [id, status] of Object.entries({
      complete: 'complete', success: 'success', error: 'error', timeout: 'timeout', canceled: 'canceled',
      stopped: 'stopped', deleted: 'deleted',
    })) insert.run(id, id, status, 1_785_081_600, 'scratch');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.tasks.status !== 'available') throw new Error('Expected tasks');
    const states = Object.fromEntries(snapshot.tasks.data.map((task) => [task.id.split(':').at(-1), task.state]));

    expect(states).toEqual({
      canceled: 'cancelled', complete: 'succeeded', deleted: 'archived', error: 'failed',
      stopped: 'cancelled', success: 'succeeded', timeout: 'failed',
    });
  });

  it('reports inaccessible board discovery as unavailable instead of throwing', async () => {
    const home = await createHome();
    await mkdir(join(home, 'kanban'), { recursive: true });
    await writeFile(join(home, 'kanban', 'boards'), 'not a directory');

    const adapter = new HermesRuntimeAdapter({ hermesHome: home });

    const provider = await adapter.describe();
    expect(provider).toEqual(expect.objectContaining({
      health: expect.objectContaining({ state: 'unavailable' }),
    }));
    expect(provider.health.message).not.toContain(home);
    await expect(adapter.getSnapshot()).resolves.toEqual(expect.objectContaining({ state: 'unavailable' }));
    await expect(adapter.getSnapshot({ workspaceId: 'hermes:missing' }))
      .resolves.toEqual(expect.objectContaining({ state: 'unavailable' }));
  });

  it('maps approval and HITL blockers to needs-input', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET block_kind = ? WHERE id = ?').run('approval', 't_child');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.blockers).toEqual(expect.objectContaining({
      data: [expect.objectContaining({ taskId: 'hermes:global:t_child', category: 'needs-input' })],
    }));
  });

  it('timestamps blockers from their latest blocking transition', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)').run(
      11, 't_parent', 1, 'heartbeat', '{}', 1_785_081_700,
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({ activityLimit: 1 });

    expect(snapshot.blockers).toEqual(expect.objectContaining({
      data: [expect.objectContaining({
        taskId: 'hermes:global:t_child',
        createdAt: '2026-07-26T16:00:50.000Z',
      })],
    }));
  });

  it('includes established comments table activity in snapshots', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.exec(`
      DROP TABLE task_comments;
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      INSERT INTO comments (id, task_id, body, created_at)
      VALUES (21, 't_child', 'Established comment activity', 1785081670);
    `);
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.events.status !== 'available') throw new Error('Expected events');

    expect(snapshot.events.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'hermes:global:comment:21',
        taskId: 'hermes:global:t_child',
        summary: 'Established comment activity',
      }),
    ]));
  });

  it('replays established comments table activity', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.exec(`
      DROP TABLE task_comments;
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      INSERT INTO comments (id, task_id, body, created_at)
      VALUES (21, 't_child', 'Established replay activity', 1785081670);
    `);
    db.close();

    const page = await new HermesRuntimeAdapter({ hermesHome: home }).getEvents({ limit: 10 });

    expect(page.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'hermes:global:comment:21',
        summary: 'Established replay activity',
      }),
    ]));
  });

  it('ignores optional comment tables that lack required activity columns', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.exec(`
      DROP TABLE task_comments;
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, body TEXT NOT NULL
      );
      INSERT INTO comments (id, task_id, body)
      VALUES (21, 't_child', 'Legacy partial comment');
    `);
    db.close();

    const adapter = new HermesRuntimeAdapter({ hermesHome: home });
    const snapshot = await adapter.getSnapshot();
    const page = await adapter.getEvents({ limit: 10 });

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'ready',
      tasks: expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:t_parent' })]),
      }),
    }));
    expect(page.events.some((event) => event.id.includes(':comment:'))).toBe(false);
  });

  it('ignores optional task-link tables that lack required columns', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.exec('DROP TABLE task_links; CREATE TABLE task_links (id INTEGER PRIMARY KEY);');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'ready',
      tasks: expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({
          id: 'hermes:global:t_parent',
          dependencyIds: [],
        })]),
      }),
    }));
  });

  it('preserves opaque Hermes session identifiers exactly', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const sessionId = `api_key=opaque/${'x'.repeat(600)}`;
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, 't_parent');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.runs).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({
        id: 'hermes:global:run:1',
        sessionId,
      })]),
    }));
  });

  it('degrades a workspace with corrupt required timestamps instead of fabricating epoch activity', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET created_at = ? WHERE id = ?').run('not-a-timestamp', 't_parent');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    expect(snapshot.state).toBe('degraded');
    expect(JSON.stringify(snapshot)).not.toContain('1970-01-01T00:00:00.000Z');
  });

  it('does not report an agent running from a stale current-run pointer on a terminal task', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('done', 't_parent');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    expect(snapshot.agents).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:worker-a', state: 'idle' })]),
    }));
  });

  it('includes a running profile when its nonterminal task has no current-run pointer', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET assignee = NULL, current_run_id = NULL WHERE id = ?').run('t_parent');
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.agents).toEqual(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'hermes:global:worker-a', state: 'running' }),
      ]),
    }));
  });

  it('selects only the latest active run for a nonterminal task without a current-run pointer', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET assignee = NULL, current_run_id = NULL WHERE id = ?').run('t_parent');
    db.prepare(`INSERT INTO task_runs
      (id,task_id,profile,status,started_at,summary,metadata,last_heartbeat_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      2, 't_parent', 'new-worker', 'running', 1_785_081_630, null, '{}', 1_785_081_640,
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.agents.status !== 'available') throw new Error('Expected agents');

    expect(snapshot.agents.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hermes:global:new-worker', state: 'running' }),
    ]));
    expect(snapshot.agents.data.some((agent) => agent.id === 'hermes:global:worker-a')).toBe(false);
  });

  it('does not retain an older active pointerless run after a newer terminal run', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET assignee = NULL, current_run_id = NULL WHERE id = ?').run('t_parent');
    db.prepare('UPDATE task_runs SET profile = ?, status = ?, outcome = ? WHERE id = ?')
      .run('worker-old', 'running', 'running', 1);
    db.prepare(`INSERT INTO task_runs
      (id,task_id,profile,status,started_at,ended_at,outcome,metadata,last_heartbeat_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      2, 't_parent', 'worker-new', 'done', 1_785_081_650, 1_785_081_660,
      'completed', '{}', 1_785_081_660,
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.agents.status !== 'available') throw new Error('Expected agents');

    expect(snapshot.agents.data.map((agent) => agent.id)).not.toContain('hermes:global:worker-old');
  });

  it('derives agent state from the normalized run outcome', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET assignee = NULL WHERE id = ?').run('t_parent');
    db.prepare('UPDATE task_runs SET status = ?, outcome = ? WHERE id = ?').run('running', 'blocked', 1);
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.runs).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:run:1', state: 'blocked' })]),
    }));
    expect(snapshot.agents).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:worker-a', state: 'blocked' })]),
    }));
  });

  it('falls back to run status when the stored outcome is blank', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET assignee = NULL WHERE id = ?').run('t_parent');
    db.prepare('UPDATE task_runs SET status = ?, outcome = ? WHERE id = ?').run('running', '', 1);
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();

    expect(snapshot.runs).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:run:1', state: 'running' })]),
    }));
    expect(snapshot.agents).toEqual(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'hermes:global:worker-a', state: 'running' })]),
    }));
  });

  it('normalizes stopped runs as cancelled', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE task_runs SET outcome = ?, status = ? WHERE id = ?').run('stopped', 'stopped', 1);
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.runs.status !== 'available') throw new Error('Expected runs');

    expect(snapshot.runs.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hermes:global:run:1', state: 'cancelled' }),
    ]));
  });

  it('bounds historical snapshot runs while retaining the current run', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    for (let id = 2; id <= 8; id += 1) {
      db.prepare(`INSERT INTO task_runs
        (id,task_id,profile,status,started_at,summary,metadata,last_heartbeat_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        id, 't_child', `historical-${id}`, 'done', 1_785_081_600 + id, null, '{}', 1_785_081_600 + id,
      );
    }
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({ activityLimit: 2 });
    if (snapshot.runs.status !== 'available') throw new Error('Expected runs');

    expect(snapshot.runs.data).toHaveLength(2);
    expect(snapshot.runs.data.map((run) => run.id)).toContain('hermes:global:run:1');
    expect(snapshot.runs.data.map((run) => run.id)).toContain('hermes:global:run:8');
  });

  it('retains the latest active pointerless run outside the bounded global history', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare('UPDATE tasks SET assignee = NULL, current_run_id = NULL WHERE id = ?').run('t_parent');
    for (let id = 2; id <= 8; id += 1) {
      db.prepare(`INSERT INTO task_runs
        (id,task_id,profile,status,started_at,summary,metadata,last_heartbeat_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        id, 't_child', `historical-${id}`, 'done', 1_785_081_700 + id, null, '{}', 1_785_081_700 + id,
      );
    }
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({ activityLimit: 2 });
    if (snapshot.runs.status !== 'available' || snapshot.agents.status !== 'available') throw new Error('Expected data');

    expect(snapshot.runs.data.map((run) => run.id)).toContain('hermes:global:run:1');
    expect(snapshot.agents.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hermes:global:worker-a', state: 'running' }),
    ]));
  });

  it('does not retain stale current runs for terminal tasks outside the bounded history', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    for (let id = 2; id <= 6; id += 1) {
      const task = `done-${id}`;
      db.prepare(`INSERT INTO tasks
        (id,title,status,created_at,workspace_kind,current_run_id)
        VALUES (?,?,?,?,?,?)`).run(task, task, 'done', 1_785_081_600 + id, 'scratch', id);
      db.prepare(`INSERT INTO task_runs
        (id,task_id,profile,status,started_at,ended_at,outcome,metadata,last_heartbeat_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, task, `historical-${id}`, 'done', 1_785_081_700 + id, 1_785_081_800 + id,
        'completed', '{}', 1_785_081_800 + id,
      );
    }
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot({ activityLimit: 1 });
    if (snapshot.runs.status !== 'available') throw new Error('Expected runs');

    expect(snapshot.runs.data.map((run) => run.id).sort()).toEqual([
      'hermes:global:run:1',
      'hermes:global:run:6',
    ]);
  });

  it('excludes a stale running profile when a nonterminal task has a different current run', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const db = new Database(dbPath);
    db.prepare(`INSERT INTO task_runs
      (id,task_id,profile,status,started_at,summary,metadata,last_heartbeat_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      2, 't_parent', 'stale-worker', 'running', 1_785_081_600, null, '{}', 1_785_081_605,
    );
    db.close();

    const snapshot = await new HermesRuntimeAdapter({ hermesHome: home }).getSnapshot();
    if (snapshot.agents.status !== 'available') throw new Error('Expected agents');

    expect(snapshot.agents.data.some((agent) => agent.id === 'hermes:global:stale-worker')).toBe(false);
    expect(snapshot.agents.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hermes:global:worker-a', state: 'running' }),
    ]));
  });

  it('discovers configured databases read-only and normalizes live task topology without leaking storage fields', async () => {
    const home = await createHome();
    await mkdir(join(home, 'kanban', 'boards', 'alpha'), { recursive: true });
    createCurrentKanban(join(home, 'kanban.db'));
    createCurrentKanban(join(home, 'kanban', 'boards', 'alpha', 'kanban.db'));
    const adapter = new HermesRuntimeAdapter({ hermesHome: home, now: () => new Date('2026-07-26T12:00:00.000Z') });

    const provider = await adapter.describe();
    const snapshot = RuntimeSnapshotSchema.parse(await adapter.getSnapshot({ workspaceId: 'hermes:alpha', activityLimit: 10 }));

    expect(provider).toMatchObject({
      id: 'hermes',
      runtime: 'hermes',
      health: { state: 'connected' },
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'supported' },
        approvals: { status: 'unsupported' },
        pause: { status: 'unsupported' },
      },
    });
    expect(snapshot.state).toBe('ready');
    expect(snapshot.workspaces).toEqual({
      status: 'available',
      data: [expect.objectContaining({ id: 'hermes:alpha', name: 'alpha', kind: 'board', state: 'available' })],
    });
    expect(snapshot.tasks).toEqual({
      status: 'available',
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'hermes:alpha:t_parent', state: 'running', ownerIds: ['hermes:alpha:worker-a'] }),
        expect.objectContaining({
          id: 'hermes:alpha:t_child',
          state: 'blocked',
          parentIds: ['hermes:alpha:t_parent'],
          dependencyIds: ['hermes:alpha:t_parent'],
          ownerIds: ['hermes:alpha:worker-b'],
        }),
      ]),
    });
    expect(snapshot.runs).toEqual({
      status: 'available',
      data: [expect.objectContaining({
        id: 'hermes:alpha:run:1',
        taskId: 'hermes:alpha:t_parent',
        agentId: 'hermes:alpha:worker-a',
        sessionId: 'session-private',
        state: 'running',
        summary: 'Authorization: Bearer <redacted>',
      })],
    });
    expect(snapshot.blockers).toEqual({
      status: 'available',
      data: [expect.objectContaining({ taskId: 'hermes:alpha:t_child', category: 'needs-input' })],
    });
    expect(snapshot.approvals).toEqual({ status: 'unsupported', reason: expect.any(String) });
    expect(JSON.stringify(snapshot)).not.toContain('/home/private');
    expect(JSON.stringify(snapshot)).not.toContain('super-secret');
    expect(JSON.stringify(snapshot)).not.toContain('tableName');

    if (snapshot.events.status !== 'available') throw new Error('Expected available Hermes events');
    const firstEvent = snapshot.events.data[0]!;
    const replayPage = await adapter.getEvents({
      workspaceId: 'hermes:alpha',
      cursor: firstEvent.cursor,
      limit: 1,
    });
    expect(replayPage.events).toHaveLength(1);
    expect(replayPage.events[0]!.id).not.toBe(firstEvent.id);
    expect(JSON.stringify(replayPage)).not.toContain('super-secret');
  });

  it('replays every event after a cursor even when more than the activity snapshot bound arrived', async () => {
    const home = await createHome();
    const dbPath = join(home, 'kanban.db');
    createCurrentKanban(dbPath);
    const adapter = new HermesRuntimeAdapter({ hermesHome: home });
    const before = await adapter.getEvents({ limit: 10 });
    let cursor = before.nextCursor!;

    const db = new Database(dbPath);
    const insert = db.prepare(
      'INSERT INTO task_events (id,task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?,?)',
    );
    const insertMany = db.transaction(() => {
      for (let index = 0; index < 600; index += 1) {
        insert.run(100 + index, 't_parent', 1, 'progress', null, 1_785_081_700 + index);
      }
    });
    insertMany();
    db.close();

    const replayed = [];
    for (;;) {
      const page = await adapter.getEvents({ cursor, limit: 100 });
      replayed.push(...page.events);
      if (page.events.length === 0) break;
      cursor = page.nextCursor!;
    }

    expect(replayed).toHaveLength(600);
    expect(new Set(replayed.map((event) => event.id)).size).toBe(600);
  });
});
