import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BenchmarkMatrixRow, BenchmarkTask } from '../src/types.js';
import { FixtureStore } from '../src/workspace/fixture-store.js';
import { WorkspaceProvisioner } from '../src/workspace/workspace-provisioner.js';

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const task: BenchmarkTask = {
  taskId: 'write-readme',
  tier: 'core',
  taskClass: 'artifact-critical',
  projectFixture: 'tiny-node',
  prompt: 'Create README.md.',
  expectedArtifacts: ['README.md'],
  requiredChecks: [{ type: 'file-exists', path: 'README.md' }],
  timeoutMs: 120000,
  allowedNondeterminism: [],
  baselineSupported: true,
};

const row: BenchmarkMatrixRow = {
  runId: 'run-123',
  taskId: 'write-readme',
  client: 'codex-cli',
  mode: 'baseline',
  fbeastTopology: 'none',
  model: 'gpt-test',
  clientVersion: '0.0.0-test',
  commitSha: 'abc123',
  hostClass: 'local-test',
  runTimestamp: '2026-05-23T12:34:56.000Z',
};

function createFixture(root: string): string {
  const fixtureDir = join(root, 'tiny-node');
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  mkdirSync(join(fixtureDir, '.fbeast'), { recursive: true });
  writeFileSync(join(fixtureDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  writeFileSync(join(fixtureDir, 'src', 'index.js'), 'export const answer = 42;\n', 'utf8');
  writeFileSync(join(fixtureDir, '.fbeast', 'stale.json'), '{}\n', 'utf8');
  return fixtureDir;
}

describe('workspace provisioning', () => {
  it('copies a fixture into a unique run workspace and writes environment metadata', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    const result = provisioner.provision(row, task);

    expect(result.workspaceDir).toBe(join(
      runsRoot,
      '2026-05-23',
      'run-123',
      'write-readme',
      'codex-cli',
      'baseline',
      'none',
      'model-AGcAcAB0AC0AdABlAHMAdA',
      'workspace',
    ));
    expect(result.evidenceDir).toBe(join(
      runsRoot,
      '2026-05-23',
      'run-123',
      'write-readme',
      'codex-cli',
      'baseline',
      'none',
      'model-AGcAcAB0AC0AdABlAHMAdA',
      'evidence',
    ));
    expect(existsSync(join(result.workspaceDir, 'package.json'))).toBe(true);
    expect(readFileSync(join(result.workspaceDir, 'src', 'index.js'), 'utf8')).toContain('answer = 42');
    expect(existsSync(result.evidenceDir)).toBe(true);

    const environment = JSON.parse(readFileSync(result.environmentPath, 'utf8')) as Record<string, unknown>;
    expect(environment).toMatchObject({
      fixture: 'tiny-node',
      commitSha: 'abc123',
      client: 'codex-cli',
      mode: 'baseline',
      fbeastTopology: 'none',
      runId: 'run-123',
      taskId: 'write-readme',
      provisionedAt: expect.any(String),
      runTimestamp: '2026-05-23T12:34:56.000Z',
    });
  });

  it('uses task, client, mode, topology, and model dimensions to avoid run id collisions', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    const baseline = provisioner.provision(row, task);
    writeFileSync(join(baseline.evidenceDir, 'sentinel.txt'), 'keep baseline\n', 'utf8');
    const fbeast = provisioner.provision({ ...row, mode: 'fbeast', fbeastTopology: 'proxy' }, task);
    const otherModel = provisioner.provision({ ...row, model: 'other/model:test' }, task);

    expect(fbeast.runDir).not.toBe(baseline.runDir);
    expect(otherModel.runDir).not.toBe(baseline.runDir);
    expect(readFileSync(join(baseline.evidenceDir, 'sentinel.txt'), 'utf8')).toBe('keep baseline\n');
  });

  it('uses collision-free model path segments', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    const encodedPunctuation = provisioner.provision({ ...row, runId: 'run-question', model: '?' }, task);
    writeFileSync(join(encodedPunctuation.evidenceDir, 'sentinel.txt'), 'keep question model\n', 'utf8');
    const literalLookalike = provisioner.provision({ ...row, runId: 'run-question', model: 'model-Pw' }, task);
    const loneSurrogate = provisioner.provision({ ...row, runId: 'run-question', model: '\uD800' }, task);
    writeFileSync(join(loneSurrogate.evidenceDir, 'sentinel.txt'), 'keep surrogate model\n', 'utf8');
    const replacementCharacter = provisioner.provision({ ...row, runId: 'run-question', model: '\uFFFD' }, task);

    expect(encodedPunctuation.runDir).not.toBe(literalLookalike.runDir);
    expect(loneSurrogate.runDir).not.toBe(replacementCharacter.runDir);
    expect(readFileSync(join(encodedPunctuation.evidenceDir, 'sentinel.txt'), 'utf8')).toBe('keep question model\n');
    expect(readFileSync(join(loneSurrogate.evidenceDir, 'sentinel.txt'), 'utf8')).toBe('keep surrogate model\n');
  });

  it('rejects non-canonical and timezone-less run timestamps', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    expect(() => provisioner.provision({ ...row, runTimestamp: '2026-02-31T00:00:00.000Z' }, task)).toThrow(/Invalid runTimestamp/);
    expect(() => provisioner.provision({ ...row, runTimestamp: '2026-13-01T00:00:00.000Z' }, task)).toThrow(/Invalid runTimestamp/);
    expect(() => provisioner.provision({ ...row, runTimestamp: '2026-05-23T24:00:00.000Z' }, task)).toThrow(/Invalid runTimestamp/);
    expect(() => provisioner.provision({ ...row, runTimestamp: '2026-05-23T12:34:56' }, task)).toThrow(/Invalid runTimestamp/);

    const offsetResult = provisioner.provision({ ...row, runId: 'run-offset', runTimestamp: '2026-05-23T23:30:00+02:00' }, task);
    expect(offsetResult.runDir).toContain(join('2026-05-23', 'run-offset'));
  });

  it('rejects mismatched benchmark rows and tasks before persisting metadata', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    expect(() => provisioner.provision({ ...row, taskId: 'other-task' }, task)).toThrow(/does not match task/);
  });

  it('refuses fixture names containing path traversal or separators', () => {
    const fixtures = new FixtureStore(tempRoot('live-bench-fixtures-'));

    expect(() => fixtures.resolveFixture('../secret')).toThrow(/Invalid fixture name/);
    expect(() => fixtures.resolveFixture('.')).toThrow(/Invalid fixture name/);
    expect(() => fixtures.resolveFixture('nested/fixture')).toThrow(/Invalid fixture name/);
    expect(() => fixtures.resolveFixture('nested\\fixture')).toThrow(/Invalid fixture name/);
  });

  it('rejects symlink fixture roots', () => {
    const realFixturesRoot = tempRoot('live-bench-fixtures-real-');
    const linkParent = tempRoot('live-bench-fixtures-link-parent-');
    const linkRoot = join(linkParent, 'fixtures-link');
    symlinkSync(realFixturesRoot, linkRoot, 'dir');

    expect(() => new FixtureStore(linkRoot)).toThrow(/Fixtures root must not be a symlink/);
  });

  it('rejects symlink fixtures before copying fixture contents', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const outsideRoot = tempRoot('live-bench-outside-fixture-');
    createFixture(outsideRoot);
    symlinkSync(join(outsideRoot, 'tiny-node'), join(fixturesRoot, 'linked-fixture'), 'dir');

    const fixtures = new FixtureStore(fixturesRoot);

    expect(() => fixtures.resolveFixture('linked-fixture')).toThrow(/Fixture must not be a symlink/);
  });

  it('rejects nested symlinks in fixture trees before copying', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    const outsideRoot = tempRoot('live-bench-outside-fixture-');
    createFixture(fixturesRoot);
    symlinkSync(outsideRoot, join(fixturesRoot, 'tiny-node', 'src', 'outside'), 'dir');

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    expect(() => provisioner.provision(row, task)).toThrow(/Fixture contains symlink/);
  });

  it('refuses run ids containing path traversal or separators before deleting run directories', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);
    mkdirSync(join(runsRoot, '2026-05-23', 'victim'), { recursive: true });
    writeFileSync(join(runsRoot, '2026-05-23', 'victim', 'sentinel.txt'), 'keep me\n', 'utf8');

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    expect(() => provisioner.provision({ ...row, runId: '../victim' }, task)).toThrow(/Invalid run id/);
    expect(() => provisioner.provision({ ...row, runId: 'nested/run' }, task)).toThrow(/Invalid run id/);
    expect(() => provisioner.provision({ ...row, runId: 'nested\\run' }, task)).toThrow(/Invalid run id/);
    expect(() => provisioner.provision({ ...row, runId: '.' }, task)).toThrow(/Invalid run id/);
    expect(readFileSync(join(runsRoot, '2026-05-23', 'victim', 'sentinel.txt'), 'utf8')).toBe('keep me\n');
  });

  it('rejects symlink run date directories before destructive cleanup', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    const outsideRoot = tempRoot('live-bench-outside-runs-');
    createFixture(fixturesRoot);
    symlinkSync(outsideRoot, join(runsRoot, '2026-05-23'), 'dir');

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    expect(() => provisioner.provision(row, task)).toThrow(/run date directory must not be a symlink/);
  });

  it('rejects symlink run id directories before destructive cleanup', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    const outsideRoot = tempRoot('live-bench-outside-run-id-');
    createFixture(fixturesRoot);
    mkdirSync(join(runsRoot, '2026-05-23', 'run-123'), { recursive: true });
    symlinkSync(outsideRoot, join(runsRoot, '2026-05-23', 'run-123', 'write-readme'), 'dir');

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    expect(() => provisioner.provision(row, task)).toThrow(/path component must not be a symlink/);
  });

  it('removes pre-existing .fbeast state for baseline runs', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    const result = provisioner.provision(row, task);

    expect(existsSync(join(result.workspaceDir, '.fbeast'))).toBe(false);
  });

  it('preserves fixture .fbeast state for fbeast runs', () => {
    const fixturesRoot = tempRoot('live-bench-fixtures-');
    const runsRoot = tempRoot('live-bench-runs-');
    createFixture(fixturesRoot);

    const provisioner = new WorkspaceProvisioner({
      fixtures: new FixtureStore(fixturesRoot),
      runsRoot,
    });

    const result = provisioner.provision(
      { ...row, mode: 'fbeast', fbeastTopology: 'proxy' },
      task,
    );

    expect(existsSync(join(result.workspaceDir, '.fbeast', 'stale.json'))).toBe(true);
  });
});
