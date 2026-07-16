import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildLocalToPrDryRun,
  buildReport,
} from '../../scripts/local-to-pr-dry-run.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/local-to-pr-dry-run.mjs');

function okRunner(command: string, args: string[] = []) {
  if (command === 'npm') return { ok: true, stdout: '11.5.1', stderr: '', detail: '', status: 0, command: [command, ...args].join(' ') };
  if (command === 'git' && args[0] === 'status') return { ok: true, stdout: '', stderr: '', detail: '', status: 0, command: [command, ...args].join(' ') };
  if (command === 'git' && args[0] === 'rev-parse') return { ok: true, stdout: ROOT, stderr: '', detail: '', status: 0, command: [command, ...args].join(' ') };
  if (command === 'gh' && args[0] === 'auth') return { ok: true, stdout: 'Logged in', stderr: '', detail: '', status: 0, command: [command, ...args].join(' ') };
  return { ok: true, stdout: `${command} 1.0.0`, stderr: '', detail: '', status: 0, command: [command, ...args].join(' ') };
}

describe('local-to-PR dry run helper', () => {
  it('builds a guided rehearsal that skips all remote mutations', () => {
    const report = buildLocalToPrDryRun({
      root: '/repo',
      issue: 1700,
      title: 'feat(onboarding): add guided local-to-PR dry run mode',
    });

    expect(report.dryRun).toBe(true);
    expect(report.wouldMutateRemote).toBe(false);
    expect(report.branch).toBe('resolve/issue-1700-feat-onboarding-add-guided-local-to-pr-dry-run-mode');
    expect(report.steps.map((step) => step.id)).toEqual([
      'checkout',
      'duplicate-check',
      'branch',
      'enter-worktree',
      'noop-change',
      'test-selection',
      'commit',
      'push',
      'pr-body',
      'codex',
      'cleanup',
    ]);
    for (const step of report.steps.filter((candidate) => candidate.effect === 'remote-mutation')) {
      expect(step.dryRunAction).toBe('skip');
    }
    expect(report.generatedPr.body).toContain('Closes #1700');
    expect(report.generatedPr.body).toContain('No remote mutations were executed during the dry run.');
  });

  it('requires an explicit issue number', () => {
    expect(() => buildLocalToPrDryRun({
      root: '/repo',
      title: 'feat(onboarding): add guided local-to-PR dry run mode',
    })).toThrow('issue is required');
  });

  it('surfaces actionable remediation for auth, install, and git-state failures', () => {
    const failingRunner = (command: string, args: string[] = []) => {
      if (command === 'npm') return { ok: false, stdout: '', stderr: 'npm missing', detail: 'npm missing', status: 127, command: 'npm --version' };
      if (command === 'gh' && args[0] === 'auth') return { ok: false, stdout: '', stderr: 'not logged in', detail: 'not logged in', status: 1, command: 'gh auth status' };
      if (command === 'git' && args[0] === 'status') return { ok: true, stdout: ' M README.md', stderr: '', detail: '', status: 0, command: 'git status --porcelain' };
      if (command === 'git' && args[0] === 'rev-parse') return { ok: true, stdout: ROOT, stderr: '', detail: '', status: 0, command: 'git rev-parse --show-toplevel' };
      return { ok: true, stdout: `${command} 1.0.0`, stderr: '', detail: '', status: 0, command: [command, ...args].join(' ') };
    };

    const report = buildReport({ root: ROOT, issue: 1700, title: 'dry run' }, failingRunner);

    expect(report.ok).toBe(false);
    expect(report.prerequisites.find((item) => item.id === 'npm-install')?.remediation).toContain('Corepack');
    expect(report.prerequisites.find((item) => item.id === 'github-auth')?.remediation).toContain('gh auth login');
    expect(report.prerequisites.find((item) => item.id === 'git-state')?.remediation).toContain('clean isolated worktree');
  });

  it('prints JSON without running publish commands', () => {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--json',
      '--issue', '1700',
      '--title', 'feat(onboarding): add guided local-to-PR dry run mode',
      '--root', ROOT,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect([0, 1]).toContain(result.status);
    const parsed = JSON.parse(result.stdout) as ReturnType<typeof buildLocalToPrDryRun>;
    expect(parsed.dryRun).toBe(true);
    expect(parsed.steps.some((step) => step.command.includes('git push') && step.dryRunAction === 'skip')).toBe(true);
    expect(parsed.steps.some((step) => step.command.includes('gh pr create') && step.command.includes('--body-file') && step.dryRunAction === 'skip')).toBe(true);
    expect(result.stdout).not.toContain('"dryRunAction": "execute"');
  });

  it('documents the command in package scripts and onboarding docs', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const onboarding = readFileSync(resolve(ROOT, 'ONBOARDING.md'), 'utf8');
    const quickstart = readFileSync(resolve(ROOT, 'docs/guides/quickstart.md'), 'utf8');

    expect(packageJson.scripts?.['local-to-pr:dry-run']).toBe('node scripts/local-to-pr-dry-run.mjs');
    for (const doc of [onboarding, quickstart]) {
      expect(doc).toContain('npm run local-to-pr:dry-run -- --issue 1700');
      expect(doc).toContain('Every remote mutation is skipped');
      expect(doc).toContain('git push');
      expect(doc).toContain('gh pr create');
    }
  });
});
