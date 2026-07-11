import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Session } from '../../src/cli/session.js';
import { getProjectPaths, scaffoldFrankenbeast } from '../../src/cli/project-root.js';
import type { InterviewIO } from '../../src/planning/interview-loop.js';
import { readVitestFlag } from '../../../../scripts/vitest-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Only run in E2E mode
const describeE2E = readVitestFlag(process.env, 'E2E') ? describe : describe.skip;

function mockIO(answers: string[] = ['yes']): InterviewIO {
  let idx = 0;
  return {
    ask: async () => answers[idx++] ?? 'yes',
    display: (_msg: string) => { /* noop in tests */ },
  };
}

function initializeGitRepository(root: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Frankenbeast Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'frankenbeast-test@example.com'], { cwd: root });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'test: initialize e2e fixture repository'], { cwd: root });
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

  it('creates .fbeast directory structure', () => {
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
    expect(existsSync(paths.plansDir)).toBe(true);
    expect(existsSync(paths.buildDir)).toBe(true);
  });

  it('Session detects execute phase with --plan-dir', async () => {
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
    initializeGitRepository(testDir);
    const trustedBinDir = resolve(testDir, '.fbeast/bin');
    const missingClaudeCli = resolve(trustedBinDir, 'missing-claude');

    const session = new Session({
      paths,
      baseBranch: 'main',
      budget: 1,
      provider: 'claude',
      providers: ['claude'],
      providersConfig: {
        claude: {
          command: missingClaudeCli,
          trustCommandOverride: true,
          trustedCommandPaths: [trustedBinDir],
        },
      },
      trustProviderCommandOverrides: true,
      noPr: true,
      verbose: false,
      reset: false,
      io: mockIO(),
      entryPhase: 'execute',
      planDirOverride: fixtureChunks,
    });

    // This should fail only after the session reaches execute-phase provider
    // dispatch. Earlier fixture/config/scaffolding regressions should not satisfy
    // this assertion.
    const result = await session.start();

    expect(result?.status).toBe('failed');
    expect(result?.phase).toBe('closure');
    expect(result?.taskResults[0]?.error).toMatch(
      /MartinLoop failed for chunk "01_hello": No configured LLM provider CLI is available\..*Last error: llm spawn failed: claude \(ENOENT\)/s,
    );
    expect(result?.taskResults[0]?.error).not.toMatch(/Git isolation failed|fixture path|bad config parsing/i);
  });

  it('project paths are correctly derived', () => {
    const paths = getProjectPaths(testDir);
    expect(paths.checkpointFile).toContain('.fbeast/.build/.checkpoint');
    expect(paths.tracesDb).toContain('.fbeast/.build/build-traces.db');
    expect(paths.designDocFile).toContain('.fbeast/plans/design.md');
  });
});
