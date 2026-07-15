import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createGovernorAdapter } from './governor-adapter.js';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-governor-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

describe('GovernorAdapter', () => {
  const dbPaths: string[] = [];

  function tracked(path: string): string {
    dbPaths.push(path);
    return path;
  }

  afterEach(() => {
    for (const path of dbPaths) {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
    dbPaths.length = 0;
  });

  it('approves a benign action that matches no dangerous pattern', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'edit_file', context: '{"path":"src/app.ts"}' });
    expect(result.decision).toBe('approved');
  });

  it('denies legacy memory forget but allows explicit right-to-forget privacy deletions', async () => {
    // The word heuristic does not catch "forget"; classification lives in the
    // shared governor so every caller (hook, fbeast_governor_check, central
    // gate, governor_log) gets the same decision for a benign key. The explicit
    // privacy deletion workflow stays executable through the installed server.
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({ action: 'fbeast_memory_forget', context: '{"key":"note"}' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'fbeast_memory_right_to_forget', context: '{"category":"[right-to-forget-selector-redacted]"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });


  it('redacts right-to-forget context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","key":"pii:email"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_right_to_forget') as { context: string };
    db.close();
    expect(row.context).toBe('[right-to-forget-context-redacted]');
    expect(row.context).not.toContain('alice@example.test');
  });

  it('allows right-to-forget dryRun calls while keeping selector context redacted', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","dryRun":true}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_right_to_forget') as { context: string };
    db.close();
    expect(row.context).toBe('[right-to-forget-context-redacted]');
    expect(row.context).not.toContain('alice@example.test');
  });

  it('denies raw destructive patterns (rm -rf)', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'rm -rf /data', context: '{}' });
    expect(result.decision).toBe('denied');
  });

  it('denies split recursive and force rm flags in any order', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'rm -r -f /var/data' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'run_shell', context: 'rm --force --recursive /var/data' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('denies destructive verbs in action names without relying on payload text', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'delete_file', context: '{"path":"src/app.ts"}' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'dropTable', context: '{"name":"events"}' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('approves benign substrings that are not destructive verbs', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'edit_file', context: '{"path":"src/dropdown.tsx"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_node', context: 'formatMessage("hello")' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('denies when the dangerous pattern is only in the context payload', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'run_shell', context: 'rm -rf /var/data' });
    expect(result.decision).toBe('denied');
  });

  it('exempts non-executing tools on the SHARED path even with dangerous-looking payload', async () => {
    // The hook path calls the governor directly; the non-executing exemption
    // must hold here too (not only in the central gate), so storing/logging
    // risky-looking content is not a false-positive denial.
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({
      action: 'fbeast_memory_store',
      context: '{"value":"delete drop truncate rm -rf /"}',
    });
    expect(result.decision).toBe('approved');
  });

  it('redacts proposed memory context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_review_propose',
      context: '{"key":"secret","value":"token abc123","source":"chat","reason":"remember"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_review_propose') as { context: string };
    db.close();
    expect(row.context).toBe('[memory-review-proposal-context-redacted]');
    expect(row.context).not.toContain('token abc123');
  });

  it('allows memory review decisions through the shared path so queued candidates can be resolved', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"approve"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('reprices zero-cost known model rows in budget status', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run('sess-known', 'gpt-4o', 1_000_000, 1_000_000, 0);
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 20,
      byModel: [{ model: 'gpt-4o', costUsd: 20 }],
    });
  });

  it('reprices zero-cost rows before grouping budget status by model', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const db = new Database(dbPath);
    const insert = db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run('sess-known-legacy', 'gpt-4o', 1_000_000, 1_000_000, 0);
    insert.run('sess-known-explicit', 'gpt-4o', 0, 0, 3.5);
    insert.run('sess-unknown-legacy', 'new-model-not-in-pricing', 1000, 500, 0);
    insert.run('sess-unknown-explicit', 'new-model-not-in-pricing', 0, 0, 1.25);
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 24.75,
      byModel: [
        { model: 'gpt-4o', costUsd: 23.5 },
        { model: 'new-model-not-in-pricing', costUsd: 1.25, unknownModel: true },
      ],
    });
  });

  it('preserves explicit zero-cost rows in budget status', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd, cost_source)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sess-free-known', 'gpt-4o', 1_000_000, 1_000_000, 0, 'explicit');
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 0,
      byModel: [{ model: 'gpt-4o', costUsd: 0 }],
    });
  });

  it('marks zero-cost unknown model rows in budget status', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run('sess-unknown', 'new-model-not-in-pricing', 1000, 500, 0);
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 0,
      byModel: [{ model: 'new-model-not-in-pricing', costUsd: 0, unknownModel: true }],
    });
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown model "new-model-not-in-pricing"'));

    writeSpy.mockRestore();
  });
});
