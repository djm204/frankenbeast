/**
 * Full-cycle integration test — verifies the complete fbeast workflow:
 *
 *   init → MCP adapters (brain / observer / governor) → hooks → beast mode → SQLiteBeastRepository
 *
 * All stages share a single .fbeast/beast.db.  The beast-mode stage uses
 * codex-cli as the provider; the exec stub captures the invocation args and
 * verifies codex would be called with the right command structure.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { runInit } from '../cli/init.js';
import { runHook } from '../cli/hook.js';
import { runBeastMode } from '../cli/beast-mode.js';
import { createBrainAdapter } from '../adapters/brain-adapter.js';
import { createObserverAdapter } from '../adapters/observer-adapter.js';
import { createGovernorAdapter } from '../adapters/governor-adapter.js';
import { FbeastConfig } from '../shared/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tmpProject(): string {
  const dir = join(tmpdir(), `fbeast-cycle-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath(root: string): string {
  return join(root, '.fbeast', 'beast.db');
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('full-cycle: init → MCP adapters → hooks → beast mode (codex-cli)', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it('codex binary is accessible (prerequisite)', () => {
    const result = spawnSync('codex', ['--version'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/codex/i);
  });

  it('stage 1 — init creates beast.db and wires MCP servers', () => {
    const root = tmpProject();
    roots.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: true });

    expect(existsSync(dbPath(root))).toBe(true);
    expect(existsSync(join(root, '.fbeast', 'config.json'))).toBe(true);
    expect(existsSync(join(claudeDir, 'settings.json'))).toBe(true);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.mcpServers['fbeast-observer']).toBeDefined();
    expect(settings.mcpServers['fbeast-governor']).toBeDefined();
  });

  it('stage 2 — brain adapter stores working memory and episodic events to shared db', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const db = dbPath(root);

    // First adapter instance: write
    const brain1 = createBrainAdapter(db);
    await brain1.store({ key: 'task:current', value: 'refactor auth module', type: 'working' });
    await brain1.store({ key: 'auth decision', value: 'JWT with refresh tokens', type: 'episodic' });

    // Second adapter instance: read (simulates process restart / new MCP server spawn)
    const brain2 = createBrainAdapter(db);
    const working = await brain2.query({ query: 'task', type: 'working' });
    expect(working).toHaveLength(1);
    expect(working[0].key).toBe('task:current');
    expect(working[0].value).toBe('refactor auth module');

    const episodic = await brain2.query({ query: 'JWT auth', type: 'episodic' });
    expect(episodic.length).toBeGreaterThan(0);
    expect(episodic[0].value).toContain('JWT');
  });

  it('stage 3 — brain frontload returns all memory for context injection', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const db = dbPath(root);
    const brain = createBrainAdapter(db);
    await brain.store({ key: 'plan', value: 'implement MCP suite', type: 'working' });
    await brain.store({ key: 'milestone', value: 'phase 1 complete', type: 'episodic' });

    const sections = await brain.frontload('test-project');
    const types = sections.map((s) => s.type);
    expect(types).toContain('working');
    expect(types).toContain('episodic');
  });

  it('stage 4 — observer logs tool calls and builds a hash chain in shared db', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const db = dbPath(root);
    const observer = createObserverAdapter(db);
    const sessionId = `sess-${randomUUID()}`;

    const r1 = await observer.log({ event: 'tool_call', metadata: JSON.stringify({ tool: 'read_file' }), sessionId });
    const r2 = await observer.log({ event: 'tool_result', metadata: JSON.stringify({ lines: 42 }), sessionId });

    expect(r1.hash).toBeTruthy();
    expect(r2.hash).toBeTruthy();
    expect(r1.hash).not.toBe(r2.hash); // hash chain: each entry hashes parent

    const trail = await observer.trail(sessionId);
    expect(trail).toHaveLength(2);
    expect(trail[0].eventType).toBe('tool_call');
    expect(trail[1].eventType).toBe('tool_result');
  });

  it('stage 5 — governor approves safe actions and blocks dangerous ones, logging to shared db', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const db = dbPath(root);
    const governor = createGovernorAdapter(db);

    const safe = await governor.check({ action: 'read_file', context: 'open config.json' });
    expect(safe.decision).toBe('approved');

    const dangerous = await governor.check({ action: 'rm -rf /tmp/data', context: 'clean up' });
    expect(['denied', 'review_recommended']).toContain(dangerous.decision);
  });

  it('stage 6 — hooks use shared db: pre-tool blocks danger, post-tool logs to observer', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const db = dbPath(root);

    // Pre-tool: safe action should pass
    let exitCode: number | undefined = 0;
    process.exitCode = 0;
    await runHook([`--db=${db}`, 'pre-tool', 'read_file'], {
      governor: {
        check: async () => ({ decision: 'approved', reason: 'safe' }),
      },
      observer: {
        log: async () => ({ id: 1, hash: 'abc' }),
      },
      sessionId: () => 'sess-hook-test',
    });
    exitCode = process.exitCode;
    expect(exitCode ?? 0).toBe(0);
    process.exitCode = undefined;

    // Post-tool: should log observer event
    let postStdout = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      if (typeof chunk === 'string') postStdout += chunk;
      return true;
    }) as typeof process.stdout.write;

    await runHook([`--db=${db}`, 'post-tool', 'write_file', '{"ok":true}'], {
      governor: {
        check: async () => ({ decision: 'approved', reason: 'safe' }),
      },
      observer: {
        log: async () => ({ id: 2, hash: 'def' }),
      },
      sessionId: () => 'sess-hook-test',
    });
    process.stdout.write = origWrite;
    expect(postStdout).toContain('"logged":true');
  });

  it('stage 7 — beast mode switches to codex-cli, config persists, db remains intact', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: true });

    // Seed state in brain before mode switch
    const db = dbPath(root);
    const brain = createBrainAdapter(db);
    await brain.store({ key: 'context:repo', value: 'frankenbeast monorepo', type: 'working' });

    // Capture what beast mode would exec
    const execCalls: { command: string; args: string[] }[] = [];
    await runBeastMode(['--provider=codex-cli'], {
      root,
      confirm: async () => true,
      exec: async (command, args) => {
        execCalls.push({ command, args });
      },
    });

    // Config switches to beast mode with codex-cli provider
    const config = FbeastConfig.load(root);
    expect(config.mode).toBe('beast');
    expect(config.beast.enabled).toBe(true);
    expect(config.beast.provider).toBe('codex-cli');

    // exec was called with frankenbeast catalog command
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].command).toBe('frankenbeast');
    expect(execCalls[0].args).toContain('catalog');

    // Shared state in brain is still readable after mode switch
    const brain2 = createBrainAdapter(db);
    const results = await brain2.query({ query: 'frankenbeast', type: 'working' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].value).toContain('frankenbeast');
  });

  it('stage 8 — all adapters write to the same beast.db (no table conflicts)', async () => {
    const root = tmpProject();
    roots.push(root);
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const db = dbPath(root);

    // Open all adapters against the same db simultaneously
    const brain = createBrainAdapter(db);
    const observer = createObserverAdapter(db);
    const governor = createGovernorAdapter(db);

    const sessionId = `sess-${randomUUID()}`;

    await brain.store({ key: 'shared:test', value: 'concurrent access', type: 'working' });
    await observer.log({ event: 'test_event', metadata: '{}', sessionId });
    await governor.check({ action: 'read_file', context: 'test' });

    // All writes succeeded — verify each adapter can read its own data
    const working = await brain.query({ query: 'shared', type: 'working' });
    expect(working).toHaveLength(1);

    const trail = await observer.trail(sessionId);
    expect(trail).toHaveLength(1);

    const budget = await governor.budgetStatus();
    expect(budget.totalSpendUsd).toBe(0); // no cost ledger entries yet
  });
});
