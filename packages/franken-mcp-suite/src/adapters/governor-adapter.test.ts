import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
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

  it('denies a destructive fbeast tool (fbeast_memory_forget) on the SHARED path', async () => {
    // The word heuristic does not catch "forget"; classification lives in the
    // shared governor so every caller (hook, fbeast_governor_check, central
    // gate, governor_log) gets the same 'denied' decision for a benign key.
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'fbeast_memory_forget', context: '{"key":"note"}' });
    expect(result.decision).toBe('denied');
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
});
