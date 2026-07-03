import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCombinedMcpServer } from './beast.js';
import { DEFAULT_AUDIT_SESSION_ID } from './shared/central-enforcement.js';
import { createObserverAdapter } from './adapters/observer-adapter.js';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-combined-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

describe('combined fbeast MCP server', () => {
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

  it('wires audit logging through the aggregate fbeast dispatch path', async () => {
    const dbPath = tracked(tmpDbPath());
    const server = createCombinedMcpServer(dbPath);

    const result = await server.callTool('fbeast_memory_query', { query: `missing-${randomUUID()}` });

    expect(result.isError).toBeFalsy();
    const trail = await createObserverAdapter(dbPath).trail(DEFAULT_AUDIT_SESSION_ID);
    expect(trail.map((row) => row.eventType)).toEqual(['tool_call']);
    expect(JSON.parse(trail[0]!.payload)).toEqual(expect.objectContaining({
      source: 'central-dispatch',
      tool: 'fbeast_memory_query',
      ok: true,
    }));
  });
});
