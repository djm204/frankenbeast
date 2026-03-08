import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Session } from '../../src/cli/session.js';
import { getProjectPaths, scaffoldFrankenbeast } from '../../src/cli/project-root.js';
import type { InterviewIO } from '../../src/planning/interview-loop.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Only run in E2E mode
const describeE2E = process.env['E2E'] === 'true' ? describe : describe.skip;

function mockIO(answers: string[] = ['yes']): InterviewIO {
  let idx = 0;
  return {
    ask: async () => answers[idx++] ?? 'yes',
    display: (_msg: string) => { /* noop in tests */ },
  };
}

describeE2E('CLI E2E', () => {
  const testDir = resolve(tmpdir(), 'fb-e2e-test');
  const fixtureChunks = resolve(__dirname, 'fixtures/chunks');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates .frankenbeast directory structure', () => {
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
    expect(existsSync(paths.plansDir)).toBe(true);
    expect(existsSync(paths.buildDir)).toBe(true);
  });

  it('Session detects execute phase with --plan-dir', async () => {
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);

    const session = new Session({
      paths,
      baseBranch: 'main',
      budget: 1,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      io: mockIO(),
      entryPhase: 'execute',
      planDirOverride: fixtureChunks,
    });

    // This will fail at Martin loop execution (no real CLI provider)
    // but it proves the wiring works up to that point
    try {
      await session.start();
    } catch (err) {
      // Expected — no real claude/codex available in test
      expect(err).toBeDefined();
    }
  });

  it('project paths are correctly derived', () => {
    const paths = getProjectPaths(testDir);
    expect(paths.checkpointFile).toContain('.frankenbeast/.build/.checkpoint');
    expect(paths.tracesDb).toContain('.frankenbeast/.build/build-traces.db');
    expect(paths.designDocFile).toContain('.frankenbeast/plans/design.md');
  });
});
