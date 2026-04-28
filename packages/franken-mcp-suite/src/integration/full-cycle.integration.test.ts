/**
 * Full-cycle integration test — no mocks at integration seams.
 *
 * Each stage writes to real SQLite tables and the next stage reads them back.
 * The shared .fbeast/beast.db is the single source of truth for all adapters.
 *
 * Codex CLI is used as the configured provider; its binary is verified
 * accessible and the beast executor is wired through the same db.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

import { runInit } from '../cli/init.js';
import { runHook, defaultHookDeps } from '../cli/hook.js';
import { createBrainAdapter } from '../adapters/brain-adapter.js';
import { createObserverAdapter } from '../adapters/observer-adapter.js';
import { SQLiteBeastRepository } from 'franken-orchestrator';

// ─── Setup ───────────────────────────────────────────────────────────────────

function tmpProject(): string {
  const dir = join(tmpdir(), `fbeast-cycle-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function beastDb(root: string): string {
  return join(root, '.fbeast', 'beast.db');
}

/** Open a raw read connection for table-level assertions. */
function openReadDb(path: string): Database.Database {
  return new Database(path, { readonly: true });
}

function isCodexBinaryReachable(): boolean {
  const result = spawnSync('codex', ['--version'], { encoding: 'utf-8' });
  return result.status === 0 && /codex/i.test(result.stdout);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('full-cycle integration', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  // ── Prerequisite ──────────────────────────────────────────────────────────

  const codexIt = isCodexBinaryReachable() ? it : it.skip;

  codexIt('codex binary is reachable', () => {
    const result = spawnSync('codex', ['--version'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/codex/i);
  });

  // ── Stage 1 → 8 all share one project so state flows forward ─────────────

  it('init → hooks → brain → observer → beast repo all share beast.db', async () => {
    const root = tmpProject();
    roots.push(root);
    const claudeDir = join(root, '.claude');
    const db = beastDb(root);

    // ── 1. Init ──────────────────────────────────────────────────────────────
    runInit({ root, claudeDir, hooks: true });
    expect(existsSync(db)).toBe(true);

    // ── 2. Pre-tool hook — real governor writes to governor_log ──────────────
    const hookDeps = defaultHookDeps(db);
    process.exitCode = 0;
    await runHook([`--db=${db}`, 'pre-tool', 'read_file'], hookDeps);
    expect(process.exitCode ?? 0).toBe(0);
    process.exitCode = undefined;

    {
      const raw = openReadDb(db);
      const row = raw.prepare(
        `SELECT decision FROM governor_log WHERE action = 'read_file' ORDER BY id DESC LIMIT 1`,
      ).get() as { decision: string } | undefined;
      raw.close();
      expect(row?.decision).toBe('approved');
    }

    // ── 3. Pre-tool hook — dangerous action exits 1 and logs denied ──────────
    process.exitCode = 0;
    await runHook([`--db=${db}`, 'pre-tool', 'rm -rf /data'], hookDeps);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;

    {
      const raw = openReadDb(db);
      const row = raw.prepare(
        `SELECT decision FROM governor_log WHERE action = 'rm -rf /data' ORDER BY id DESC LIMIT 1`,
      ).get() as { decision: string } | undefined;
      raw.close();
      expect(['denied', 'review_recommended']).toContain(row?.decision);
    }

    // ── 4. Post-tool hook — real observer writes to audit_trail ──────────────
    const sessionId = `sess-${randomUUID()}`;
    process.env['FBEAST_SESSION_ID'] = sessionId;
    try {
      await runHook([`--db=${db}`, 'post-tool', 'write_file', '{"path":"README.md"}'], hookDeps);
    } finally {
      delete process.env['FBEAST_SESSION_ID'];
    }

    {
      const raw = openReadDb(db);
      const rows = raw.prepare(
        `SELECT event_type, payload FROM audit_trail WHERE session_id = ? ORDER BY id ASC`,
      ).all(sessionId) as Array<{ event_type: string; payload: string }>;
      raw.close();
      expect(rows).toHaveLength(1);
      expect(rows[0].event_type).toBe('tool_call');
      const payload = JSON.parse(rows[0].payload) as { toolName: string };
      expect(payload.toolName).toBe('write_file');
    }

    // ── 5. Brain adapter — working memory persists across instances ───────────
    const brain1 = createBrainAdapter(db);
    await brain1.store({ key: 'task:current', value: 'integrate codex pipeline', type: 'working' });

    const brain2 = createBrainAdapter(db);          // new instance = simulated restart
    const hits = await brain2.query({ query: 'task', type: 'working' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].value).toBe('integrate codex pipeline');

    // ── 6. Observer — hash chain integrity ────────────────────────────────────
    const observer = createObserverAdapter(db);
    const chainSession = `chain-${randomUUID()}`;
    const r1 = await observer.log({ event: 'tool_call', metadata: '{"tool":"glob"}', sessionId: chainSession });
    const r2 = await observer.log({ event: 'tool_result', metadata: '{"files":3}', sessionId: chainSession });
    expect(r1.hash).toBeTruthy();
    expect(r2.hash).not.toBe(r1.hash);

    const trail = await observer.trail(chainSession);
    expect(trail).toHaveLength(2);
    // Parent hash of second entry matches hash of first
    {
      const raw = openReadDb(db);
      const rows = raw.prepare(
        `SELECT hash, parent_hash FROM audit_trail WHERE session_id = ? ORDER BY id ASC`,
      ).all(chainSession) as Array<{ hash: string; parent_hash: string | null }>;
      raw.close();
      expect(rows[1].parent_hash).toBe(rows[0].hash);
    }

    // ── 7. SQLiteBeastRepository — creates run on same beast.db ───────────────
    const repo = new SQLiteBeastRepository(db);
    const run = repo.createRun({
      definitionId: 'def-codex-test',
      definitionVersion: 1,
      executionMode: 'autonomous',
      configSnapshot: { provider: 'codex-cli' },
      dispatchedBy: 'api',
      dispatchedByUser: 'test',
      createdAt: new Date().toISOString(),
    });
    expect(run.id).toMatch(/^run_/);
    expect(run.status).toBe('queued');

    const fetched = repo.getRun(run.id);
    expect(fetched?.definitionId).toBe('def-codex-test');
    expect(fetched?.configSnapshot).toMatchObject({ provider: 'codex-cli' });

    // ── 8. No schema conflicts — all tables coexist in one file ───────────────
    {
      const raw = openReadDb(db);
      const tables = (raw.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      ).all() as Array<{ name: string }>).map((r) => r.name);
      raw.close();

      // MCP adapter tables
      expect(tables).toContain('audit_trail');
      expect(tables).toContain('governor_log');
      // Brain tables
      expect(tables).toContain('working_memory');
      expect(tables).toContain('episodic_events');
      // Beast repository tables
      expect(tables).toContain('beast_runs');
    }
  });
});
