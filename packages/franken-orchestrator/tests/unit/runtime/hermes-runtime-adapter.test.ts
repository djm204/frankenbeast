import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HermesRuntimeAdapter } from '../../../src/runtime/hermes/hermes-runtime-adapter.js';
import { RuntimeSnapshotSchema } from '../../../src/runtime/index.js';

const tempHomes: string[] = [];

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
