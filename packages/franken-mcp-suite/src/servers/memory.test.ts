import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMemoryServer } from './memory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('Memory Server', () => {
  let store: SqliteStore;
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `fbeast-mem-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStore(join(dir, 'beast.db'));
  });

  afterEach(() => {
    store.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes 4 tools', () => {
    const server = createMemoryServer(store);
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual([
      'fbeast_memory_query',
      'fbeast_memory_store',
      'fbeast_memory_frontload',
      'fbeast_memory_forget',
    ]);
  });

  it('store and query round-trip', async () => {
    const server = createMemoryServer(store);
    const storeTool = server.tools.find((t) => t.name === 'fbeast_memory_store')!;
    const queryTool = server.tools.find((t) => t.name === 'fbeast_memory_query')!;

    await storeTool.handler({ key: 'api-pattern', value: 'REST with HATEOAS', type: 'working' });
    const result = await queryTool.handler({ query: 'api' });

    expect(result.content[0]!.text).toContain('api-pattern');
    expect(result.content[0]!.text).toContain('REST with HATEOAS');
  });

  it('forget removes entry', async () => {
    const server = createMemoryServer(store);
    const storeTool = server.tools.find((t) => t.name === 'fbeast_memory_store')!;
    const forgetTool = server.tools.find((t) => t.name === 'fbeast_memory_forget')!;
    const queryTool = server.tools.find((t) => t.name === 'fbeast_memory_query')!;

    await storeTool.handler({ key: 'temp', value: 'data', type: 'working' });
    await forgetTool.handler({ key: 'temp' });
    const result = await queryTool.handler({ query: 'temp' });

    expect(result.content[0]!.text).not.toContain('data');
  });

  it('frontload returns all entries for project', async () => {
    const server = createMemoryServer(store);
    const storeTool = server.tools.find((t) => t.name === 'fbeast_memory_store')!;
    const frontloadTool = server.tools.find((t) => t.name === 'fbeast_memory_frontload')!;

    await storeTool.handler({ key: 'rule-1', value: 'no console.log', type: 'working' });
    await storeTool.handler({ key: 'adr-1', value: 'use REST', type: 'episodic' });

    const result = await frontloadTool.handler({ projectId: 'test' });
    const text = result.content[0]!.text;
    expect(text).toContain('rule-1');
    expect(text).toContain('adr-1');
  });
});
