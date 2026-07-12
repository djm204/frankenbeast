import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

beforeAll(() => {
  for (const workspace of ['@franken/types', '@franken/live-bench']) {
    execFileSync(npmCommand, ['run', 'build', `--workspace=${workspace}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }
}, 60_000);

function runCli(args: string[], cwd = packageRoot) {
  return spawnSync(npmCommand, ['exec', '--', 'fbeast-live-bench', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('live-bench CLI smoke coverage', () => {
  it('prints help for --help', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fbeast-live-bench');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('list <corpus-root>');
  });

  it('lists benchmark task ids sorted for a valid corpus', () => {
    const corpusDir = mkdtempSync(join(tmpdir(), 'live-bench-corpus-'));
    const taskOne = {
      taskId: 'zeta-task',
      tier: 'candidate',
      taskClass: 'tool-critical',
      projectFixture: 'project',
      prompt: 'run check',
      expectedArtifacts: ['artifacts/out.txt'],
      requiredChecks: [{ type: 'file-exists', path: 'artifacts/out.txt' }],
      timeoutMs: 45_000,
      allowedNondeterminism: [],
      baselineSupported: false,
    };
    const taskTwo = {
      taskId: 'alpha-task',
      tier: 'core',
      taskClass: 'workflow-critical',
      projectFixture: 'project',
      prompt: 'run check',
      expectedArtifacts: ['artifacts/out.txt'],
      requiredChecks: [
        {
          type: 'file-exists',
          path: 'artifacts/out.txt',
        },
      ],
      timeoutMs: 60_000,
      allowedNondeterminism: [],
      baselineSupported: true,
    };

    writeFileSync(join(corpusDir, 'zeta.task.json'), JSON.stringify(taskOne));
    writeFileSync(join(corpusDir, 'alpha.task.json'), JSON.stringify(taskTwo));

    try {
      const result = runCli(['list', corpusDir]);

      expect(result.status).toBe(0);
      expect(result.stdout.split('\n').filter(Boolean)).toEqual(['alpha-task', 'zeta-task']);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
    }
  });

  it('exits with code 2 when required corpus arg is missing', () => {
    const result = runCli(['list']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage: fbeast-live-bench list <corpus-root>');
  });

  it('exits with code 2 for unknown commands', () => {
    const result = runCli(['unsupported']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown command: unsupported');
  });

  it('returns non-zero and surfaces invalid corpus files', () => {
    const corpusDir = mkdtempSync(join(tmpdir(), 'live-bench-invalid-corpus-'));
    writeFileSync(join(corpusDir, 'broken.task.json'), '{not-json', 'utf8');

    try {
      const result = runCli(['list', corpusDir]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Invalid benchmark task');
      expect(result.stderr).toContain('broken.task.json');
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
    }
  });
});
