import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createObserverAdapter } from './observer-adapter.js';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-observer-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

describe('ObserverAdapter', () => {
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

  it('chains later audit hashes through the previous entry hash', async () => {
    const secondHashFrom = async (firstMetadata: string): Promise<string> => {
      const observer = createObserverAdapter(tracked(tmpDbPath()));
      const sessionId = randomUUID();

      await observer.log({
        event: 'tool_call',
        metadata: firstMetadata,
        sessionId,
      });

      const second = await observer.log({
        event: 'tool_result',
        metadata: JSON.stringify({ tool: 'memory', ok: true }),
        sessionId,
      });

      return second.hash;
    };

    const baseline = await secondHashFrom(JSON.stringify({ tool: 'memory', step: 1 }));
    const mutatedHistory = await secondHashFrom(JSON.stringify({ tool: 'memory', step: 999 }));

    expect(mutatedHistory).not.toBe(baseline);
  });
});
