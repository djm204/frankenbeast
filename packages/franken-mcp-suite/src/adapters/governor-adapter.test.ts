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

  it('flags a destructive fbeast tool (fbeast_memory_forget) on the SHARED path', async () => {
    // The word heuristic does not catch "forget"; classification lives in the
    // shared governor so every caller (hook, fbeast_governor_check, central
    // gate, governor_log) gets the same non-approved decision for a benign key.
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'fbeast_memory_forget', context: '{"key":"note"}' });
    expect(result.decision).not.toBe('approved');
    expect(result.decision).toBe('review_recommended');
  });

  it('still flags raw destructive patterns (rm -rf)', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'rm -rf /data', context: '{}' });
    expect(result.decision).not.toBe('approved');
  });
});
