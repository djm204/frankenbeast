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

  it('requires review for legacy memory forget and explicit right-to-forget privacy deletions', async () => {
    // Durable memory deletion is a high-risk action on every path (hook,
    // fbeast_governor_check, central gate, governor_log). Dry-run privacy
    // deletion remains allowed separately so users can inspect deletion counts
    // before approval.
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({ action: 'fbeast_memory_forget', context: '{"key":"note"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_right_to_forget', context: '{"category":"[right-to-forget-selector-redacted]"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });


  it('redacts right-to-forget context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","key":"pii:email"}',
    })).resolves.toMatchObject({ decision: 'review_recommended' });

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

  it('allows MCP-qualified right-to-forget dryRun calls while keeping selector context redacted', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-memory__fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","dryRun":true}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-memory__fbeast_memory_right_to_forget') as { context: string };
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
    await expect(governor.check({ action: 'delete__file', context: '{"path":"src/app.ts"}' }))
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

  it('routes ordinary memory stores through high-risk memory policy without scanning stored payload text', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({
      action: 'fbeast_memory_store',
      context: '{"key":"notes","value":"delete drop truncate rm -rf /"}',
    });
    expect(result.decision).toBe('review_recommended');
    expect(result.reason).toContain('Memory edits persist');
  });

  it('requires trusted-operator review for unredacted memory exports', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'fbeast_memory_export',
      context: '{"redaction":"safe"}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'fbeast_memory_export',
      context: '{"redaction":"none"}',
    })).resolves.toMatchObject({
      decision: 'review_recommended',
      reason: expect.stringContaining('trusted-operator approval'),
    });
  });

  it('routes non-memory high-risk action classes through policy-as-code', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'git push origin main', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'gh issue edit 1704 --add-label security', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'cronjob create', context: '{"operation":"create","target":"every 10m"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'profile config set', context: '{"operation":"config","profile":"default","activeProfile":"default"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'send webhook', context: '{"url":"https://hooks.example.test/a","allowlisted":false}' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'kill process 123', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('allows read-only GitHub CLI inspection while gating mutating commands', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'gh issue view 1704' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'gh pr list --state open' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'gh --repo owner/repo pr view 5' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'gh label create security' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'gh run cancel 123' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'gh --repo owner/repo pr merge 123 --merge' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'gh secret set TOKEN --body value' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('gates git pushes with global git options', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'git -C ../repo push origin main' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'git --git-dir=.git push origin main' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'git push' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('routes crontab edits through cron policy', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'crontab -l' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'crontab -e' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'crontab -r' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('denies cross-profile memory store evidence', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'fbeast_memory_store',
      context: '{"profile":"other","activeProfile":"default","key":"x"}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });

  it('detects real Slack incoming webhook URLs', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'curl -X POST https://hooks.slack.com/services/T/B/C' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'run_shell', context: 'curl -X POST https://discord.com/api/webhooks/123/token' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('does not classify ordinary service paths as process control', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'cat src/service/config.ts' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'npm test packages/user-service' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'service nginx restart' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
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

  it('redacts proxied proposed memory context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_name":"mcp__fbeast-proxy__execute_tool","tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_propose","args":{"key":"secret","value":"token abc123","source":"chat","reason":"remember"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-proxy__execute_tool') as { context: string };
    db.close();
    expect(row.context).toBe('[memory-review-proposal-context-redacted]');
    expect(row.context).not.toContain('token abc123');
  });

  it('does not hide stripped generic execute_tool payloads that only resemble memory proposals', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"secret","value":"rm -rf /","source":"chat","reason":"remember"}',
    })).resolves.toMatchObject({ decision: 'denied' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-proxy__execute_tool') as { context: string };
    db.close();
    expect(row.context).toContain('secret');
    expect(row.context).toContain('rm -rf /');
  });

  it('does not redact arbitrary execute_tool context that merely mentions the proposal tool', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"fbeast_echo","args":{"text":"mentions fbeast_memory_review_propose and rm -rf /"}}}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });

  it('allows memory review approvals/rejections but gates never-store deletions through the shared path', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"approve"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"reject"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"never_store"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"reject","note":"Rejected because candidate text contains rm -rf /"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"approve","note":"candidate"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"never_store","note":"candidate"}}}',
    })).resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('ignores dangerous reviewer notes when governing memory review decisions', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'fbeast_memory_review_decide',
      context: '{"id":"memcand_1","action":"reject","reviewer":"alice","note":"Rejected because candidate contains rm -rf /"}',
    })).resolves.toMatchObject({ decision: 'approved' });
  });

  it('redacts proxied memory review decision notes before shared governor scanning', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"reject","note":"Rejected because candidate contains rm -rf /"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });
  });

  it('does not infer memory review decisions from stripped generic execute_tool args', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"id":"memcand_1","action":"reject","note":"Rejected because candidate contains rm -rf /"}',
    })).resolves.toMatchObject({ decision: 'denied' });
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
