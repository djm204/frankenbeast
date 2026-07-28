import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readSync(
      fd: number,
      buffer: NodeJS.ArrayBufferView,
      offset: number,
      length: number,
      position: number | null,
    ) {
      return actual.readSync(fd, buffer, offset, Math.min(length, 7), position);
    },
  };
});

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionMissionCompletionDeps } from '../../../src/runtime/mission-completion-runtime.js';
import { otherwiseCompleteMission } from './mission-completion-fixtures.js';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('production mission completion bounded reads', () => {
  it('continues reading a regular evidence file after short reads', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'mission-evidence-'));
    roots.push(root, evidenceRoot);
    const inputPath = join(evidenceRoot, 'mission.json');
    const mission = otherwiseCompleteMission();
    writeFileSync(inputPath, JSON.stringify(mission));
    chmodSync(inputPath, 0o600);
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: inputPath,
        FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES: 'public-acceptance',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop',
      },
      now: () => new Date(mission.checkedAt),
    });

    await expect(deps.getInput()).resolves.toMatchObject({ missionId: mission.missionId });
  });
});
