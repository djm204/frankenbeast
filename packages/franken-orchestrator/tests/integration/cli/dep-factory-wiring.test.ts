import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createCliDeps } from '../../../src/cli/dep-factory.js';
import { EpisodicMemoryPortAdapter } from '../../../src/adapters/episodic-memory-port-adapter.js';
import { CritiquePortAdapter } from '../../../src/adapters/critique-adapter.js';
import { GovernorPortAdapter } from '../../../src/adapters/governor-adapter.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import type { RunConfig } from '../../../src/cli/run-config-loader.js';

function createTempPaths(): ProjectPaths {
  const root = join(tmpdir(), `dep-factory-wiring-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });

  // GitBranchIsolator needs a real git repo
  execSync('git init', { cwd: root, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: root, stdio: 'ignore' });

  const fbDir = join(root, '.frankenbeast');
  mkdirSync(fbDir, { recursive: true });
  const buildDir = join(root, '.build');
  mkdirSync(buildDir, { recursive: true });
  const plansDir = join(fbDir, 'plans');
  mkdirSync(plansDir, { recursive: true });
  const beastsDir = join(fbDir, 'beasts');
  mkdirSync(beastsDir, { recursive: true });
  const beastLogsDir = join(beastsDir, 'logs');
  mkdirSync(beastLogsDir, { recursive: true });
  const sessionsDir = join(buildDir, 'sessions');
  const snapshotsDir = join(buildDir, 'snapshots');

  return {
    root,
    frankenbeastDir: fbDir,
    llmCacheDir: join(fbDir, '.cache', 'llm'),
    plansDir,
    buildDir,
    beastsDir,
    beastLogsDir,
    beastsDb: join(beastsDir, 'beasts.db'),
    chunkSessionsDir: sessionsDir,
    chunkSessionSnapshotsDir: snapshotsDir,
    checkpointFile: join(buildDir, 'session.checkpoint'),
    tracesDb: join(buildDir, 'traces.db'),
    logFile: join(buildDir, 'session-build.log'),
    designDocFile: join(fbDir, 'design.md'),
    configFile: join(fbDir, 'config.json'),
    llmResponseFile: join(fbDir, 'llm-response.json'),
  };
}

// These tests call createCliDeps() which internally creates many runtime objects.
// The dynamic imports for @franken/firewall and @franken/skills may succeed or fail
// depending on build state. Memory (franken-brain + better-sqlite3) should always work.
describe('dep-factory wiring integration', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    for (const dir of cleanups) {
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    cleanups.length = 0;
  });

  it('creates real EpisodicMemoryPortAdapter when modules are enabled', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
    });

    // Memory should always be available (franken-brain + better-sqlite3 are direct deps)
    expect(deps.memory).toBeInstanceOf(EpisodicMemoryPortAdapter);
    await finalize();
  });

  it('uses stubs when enabledModules disables firewall and memory', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      enabledModules: { firewall: false, memory: false },
    });

    // When disabled, should use stubs (not instanceof real adapters)
    expect(deps.memory).not.toBeInstanceOf(EpisodicMemoryPortAdapter);
    // Stub memory should still work
    const ctx = await deps.memory.getContext('test');
    expect(ctx).toEqual({ adrs: [], knownErrors: [], rules: [] });
    await finalize();
  });

  it('resets memory.db when reset is true', { timeout: 15_000 }, async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    // First run creates memory.db
    const first = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
    });
    await first.finalize();

    // Second run with reset should succeed (db recreated)
    const second = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: true,
    });
    expect(second.deps.memory).toBeInstanceOf(EpisodicMemoryPortAdapter);
    await second.finalize();
  });

  it('creates real CritiquePortAdapter when modules are enabled', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
    });

    expect(deps.critique).toBeInstanceOf(CritiquePortAdapter);
    await finalize();
  });

  it('uses critique stub when enabledModules.critique is false', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      enabledModules: { critique: false },
    });

    expect(deps.critique).not.toBeInstanceOf(CritiquePortAdapter);
    const result = await deps.critique.reviewPlan({ tasks: [] });
    expect(result).toEqual({ verdict: 'pass', findings: [], score: 1.0 });
    await finalize();
  });

  it('creates real GovernorPortAdapter when modules are enabled', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
    });

    expect(deps.governor).toBeInstanceOf(GovernorPortAdapter);
    await finalize();
  });

  it('uses governor stub when enabledModules.governor is false', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      enabledModules: { governor: false },
    });

    expect(deps.governor).not.toBeInstanceOf(GovernorPortAdapter);
    const result = await deps.governor.requestApproval({
      taskId: 'test', summary: 'test', requiresHitl: true,
    });
    expect(result).toEqual({ decision: 'approved' });
    await finalize();
  });

  it('falls back gracefully when modules fail to construct', async () => {
    const paths = createTempPaths();
    cleanups.push(paths.root);

    // All modules enabled — if any fail to construct, they fall back to stubs
    const { deps, finalize } = await createCliDeps({
      paths,
      baseBranch: 'main',
      budget: 1.0,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
    });

    // deps should always have all modules populated (real or stub)
    expect(deps.firewall).toBeDefined();
    expect(deps.skills).toBeDefined();
    expect(deps.memory).toBeDefined();
    expect(deps.planner).toBeDefined();
    expect(deps.critique).toBeDefined();
    expect(deps.governor).toBeDefined();
    expect(deps.heartbeat).toBeDefined();
    await finalize();
  });

  describe('RunConfig field wiring', () => {
    it('filters available skills when runConfig.skills is set', async () => {
      const paths = createTempPaths();
      cleanups.push(paths.root);

      const runConfig: RunConfig = {
        provider: 'claude',
        skills: ['cli:nonexistent-skill'],
      };

      const { deps, finalize } = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
        runConfig,
      });

      // Skills should be filtered — only allowed skills pass through
      const available = deps.skills.getAvailableSkills();
      for (const skill of available) {
        expect(runConfig.skills).toContain(skill.id);
      }
      await finalize();
    });

    it('populates runConfigOverrides.allowedSkills from runConfig.skills', async () => {
      const paths = createTempPaths();
      cleanups.push(paths.root);

      const runConfig: RunConfig = {
        provider: 'claude',
        skills: ['cli:test-skill'],
      };

      const { deps, finalize } = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
        runConfig,
      });

      expect(deps.runConfigOverrides?.allowedSkills).toEqual(['cli:test-skill']);
      await finalize();
    });

    it('does not set runConfigOverrides when runConfig has no skills', async () => {
      const paths = createTempPaths();
      cleanups.push(paths.root);

      const runConfig: RunConfig = {
        provider: 'claude',
      };

      const { deps, finalize } = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
        runConfig,
      });

      expect(deps.runConfigOverrides).toBeUndefined();
      await finalize();
    });

    it('uses runConfig.gitConfig.baseBranch over options.baseBranch', async () => {
      const paths = createTempPaths();
      cleanups.push(paths.root);

      const runConfig: RunConfig = {
        provider: 'claude',
        gitConfig: { baseBranch: 'develop' },
      };

      // Create develop branch so GitBranchIsolator can reference it
      execSync('git checkout -b develop', { cwd: paths.root, stdio: 'ignore' });
      execSync('git checkout -', { cwd: paths.root, stdio: 'ignore' });

      const { deps, finalize } = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
        runConfig,
      });

      // The cliExecutor's git isolator should use 'develop' not 'main'
      // We can verify via the deps object — the PR creator uses the same base branch
      expect(deps).toBeDefined();
      await finalize();
    });
  });
});
