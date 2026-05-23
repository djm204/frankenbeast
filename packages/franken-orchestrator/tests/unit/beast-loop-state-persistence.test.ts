import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLoop } from '../../src/beast-loop.js';
import { makeDeps } from '../helpers/stubs.js';

describe('BeastLoop state persistence', () => {
  it('persists a phase snapshot after each phase', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'state-'));
    const loop = new BeastLoop(makeDeps(), { stateDir } as never);

    await loop.run({ projectId: 'proj', userInput: 'test', sessionId: 'r1' });

    const lines = readFileSync(join(stateDir, 'r1.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { runId: string; phase: string; previousPhase: string | null });
    expect(lines.map((snapshot) => snapshot.phase)).toEqual([
      'ingestion',
      'hydration',
      'planning',
      'execution',
      'closure',
    ]);
    expect(lines.at(-1)).toMatchObject({ runId: 'r1', phase: 'closure', previousPhase: 'execution' });
  });
});
