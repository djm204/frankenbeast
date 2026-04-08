import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCritiqueServer } from './critique.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('Critique Server', () => {
  let store: SqliteStore;
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `fbeast-crit-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStore(join(dir, 'beast.db'));
  });

  afterEach(() => {
    store.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes 2 tools', () => {
    const server = createCritiqueServer(store);
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_critique_evaluate', 'fbeast_critique_compare']);
  });

  it('evaluate returns verdict and score', async () => {
    const server = createCritiqueServer(store);
    const evalTool = server.tools.find((t) => t.name === 'fbeast_critique_evaluate')!;

    const result = await evalTool.handler({
      content: 'function add(a, b) { return a + b; }',
      criteria: 'correctness,readability',
    });

    const text = result.content[0]!.text;
    expect(text).toContain('verdict');
    expect(text).toContain('score');
  });

  it('compare returns improvement delta', async () => {
    const server = createCritiqueServer(store);
    const compareTool = server.tools.find((t) => t.name === 'fbeast_critique_compare')!;

    const result = await compareTool.handler({
      original: 'var x = 1; var y = 2;',
      revised: 'const x = 1;\nconst y = 2;',
    });

    const text = result.content[0]!.text;
    expect(text).toContain('original');
    expect(text).toContain('revised');
  });
});
