/**
 * Full-cycle integration test — no mocks at integration seams.
 *
 * Each stage writes to real SQLite tables and the next stage reads them back.
 * The shared .fbeast/beast.db is the single source of truth for all adapters.
 *
 * Provider execution has a dedicated smoke below; the default test is an
 * honest DB/state integration that never requires a live provider binary.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import Database from 'better-sqlite3';

import { runInit } from '../cli/init.js';
import { runHook, defaultHookDeps } from '../cli/hook.js';
import { createBrainAdapter } from '../adapters/brain-adapter.js';
import { createObserverAdapter } from '../adapters/observer-adapter.js';
import {
  BeastLogStore,
  ProcessBeastExecutor,
  ProcessSupervisor,
  SQLiteBeastRepository,
  type BeastDefinition,
  type BeastRunEvent,
} from '@franken/orchestrator';

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

function writeFakeCodexCli(root: string): { binDir: string; argsLog: string } {
  const binDir = join(root, 'bin');
  const argsLog = join(root, 'codex-args.json');
  const codexPath = join(binDir, 'codex');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    codexPath,
    `#!/usr/bin/env node\n`
      + `const fs = require('node:fs');\n`
      + `fs.writeFileSync(process.env.FBEAST_CODEX_ARGS_LOG, JSON.stringify(process.argv.slice(2)));\n`
      + `process.stdout.write(JSON.stringify({type:'message',content:[{type:'output_text',text:'FBEAST_CODEX_SMOKE'}]}) + '\\n');\n`,
  );
  chmodSync(codexPath, 0o755);
  return { binDir, argsLog };
}

function codexExecutorSmokeDefinition(): BeastDefinition {
  return {
    id: 'codex-cli-executor-smoke',
    version: 1,
    label: 'Codex CLI executor smoke',
    description: 'Exercise ProcessBeastExecutor through the Codex CLI argument path.',
    executionModeDefault: 'process',
    configSchema: z.object({
      provider: z.literal('codex-cli'),
      projectRoot: z.string().min(1),
      fakeCodexBin: z.string().min(1),
      argsLog: z.string().min(1),
    }).strict(),
    interviewPrompts: [],
    buildProcessSpec: (config) => ({
      command: 'codex',
      args: ['exec', '--full-auto', '--json', '--color', 'never', 'Return exactly FBEAST_CODEX_SMOKE.'],
      cwd: String(config.projectRoot),
      env: {
        PATH: `${String(config.fakeCodexBin)}:${process.env.PATH ?? ''}`,
        FBEAST_CODEX_ARGS_LOG: String(config.argsLog),
        FRANKENBEAST_SPAWNED: '1',
      },
    }),
    telemetryLabels: { family: 'codex-cli-executor-smoke' },
  };
}

async function waitForRunStatus(
  repo: SQLiteBeastRepository,
  runId: string,
  status: 'completed' | 'failed',
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (repo.getRun(runId)?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(repo.getRun(runId)?.status).toBe(status);
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

  codexIt('optional live Codex CLI prerequisite is reachable when installed', () => {
    const result = spawnSync('codex', ['--version'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/codex/i);
  });

  // ── Stage 1 → 8 all share one project so state flows forward ─────────────

  it('init → hooks → brain → observer → beast repo all share beast.db without provider execution', async () => {
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
      expect(row?.decision).toBe('denied');
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

    // ── 7. SQLiteBeastRepository — creates synthetic queued run on same beast.db ─
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

  it('init → beast executor → Codex CLI command records completed run in beast.db', async () => {
    const root = tmpProject();
    roots.push(root);
    const db = beastDb(root);
    const { binDir, argsLog } = writeFakeCodexCli(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const repo = new SQLiteBeastRepository(db);
    const logs = new BeastLogStore(join(root, '.fbeast', 'beast-logs'));
    const supervisor = new ProcessSupervisor({ projectRoot: root });
    const executor = new ProcessBeastExecutor(repo, logs, supervisor, { runConfigRoot: root });
    const run = repo.createRun({
      definitionId: 'codex-cli-executor-smoke',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        provider: 'codex-cli',
        projectRoot: root,
        fakeCodexBin: binDir,
        argsLog,
      },
      dispatchedBy: 'api',
      dispatchedByUser: 'test',
      createdAt: new Date().toISOString(),
    });

    const attempt = await executor.start(run, codexExecutorSmokeDefinition());
    await waitForRunStatus(repo, run.id, 'completed');

    expect(repo.getRun(run.id)).toMatchObject({
      status: 'completed',
      configSnapshot: expect.objectContaining({ provider: 'codex-cli' }),
      attemptCount: 1,
      currentAttemptId: attempt.id,
      latestExitCode: 0,
    });
    expect(repo.getAttempt(attempt.id)).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(repo.listEvents(run.id).map((event: BeastRunEvent) => event.type)).toEqual(
      expect.arrayContaining(['attempt.started', 'attempt.finished']),
    );
    const codexArgs = JSON.parse(readFileSync(argsLog, 'utf-8')) as string[];
    expect(codexArgs).toEqual([
      'exec',
      '--full-auto',
      '--json',
      '--color',
      'never',
      'Return exactly FBEAST_CODEX_SMOKE.',
    ]);
  });
});
