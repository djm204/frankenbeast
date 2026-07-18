import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildIssueWorktreePlan,
  findConflictingIssuePrs,
  parseIssueNumber,
  renderPlan,
  slugifyTitle,
} from '../../scripts/issue-worktree-bootstrap.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/issue-worktree-bootstrap.mjs');

describe('issue-to-worktree bootstrap helper', () => {
  it('derives deterministic branch and worktree names from issue metadata', () => {
    const plan = buildIssueWorktreePlan({
      issue: '#1769',
      title: 'feat(onboarding): add issue-to-worktree bootstrap helper',
      cwd: '/repo',
    });

    expect(plan.issue).toBe(1769);
    expect(plan.titleSlug).toBe('feat-onboarding-add-issue-to-worktree-bootstrap-helper');
    expect(plan.branch).toBe('resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper');
    expect(plan.worktreePath).toBe('/resolve-wt/issue-1769');
    expect(plan.commands.duplicateChecks.map((command) => command.join(' '))).toContain(
      'gh pr list --repo djm204/frankenbeast --state open --search 1769 in:body --json number,title,headRefName,url',
    );
    expect(plan.commands.duplicateChecks.map((command) => command.join(' '))).toContain(
      'git branch --all --list resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper remotes/origin/resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper',
    );
    expect(plan.commands.preflight).toContainEqual([
      'git',
      'fetch',
      'origin',
      '+refs/heads/*:refs/remotes/origin/*',
    ]);
    expect(plan.commands.create).toEqual([
      [
        'git',
        'worktree',
        'add',
        '-b',
        'resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper',
        '/resolve-wt/issue-1769',
        'origin/main',
      ],
    ]);
    expect(plan.commands.verify).toContainEqual([
      'git',
      '-C',
      '/resolve-wt/issue-1769',
      'config',
      '--worktree',
      'user.email',
      'me@davidmendez.dev',
    ]);
  });

  it('supports existing-branch reuse without creating a duplicate branch', () => {
    const plan = buildIssueWorktreePlan({
      issue: 1769,
      title: 'worktree bootstrap',
      branch: 'resolve/issue-1769-custom',
      worktreeRoot: '.worktrees',
      cwd: '/repo',
      reuse: true,
    });

    expect(plan.worktreePath).toBe('/repo/.worktrees/issue-1769');
    expect(plan.commands.create).toEqual([
      ['git', 'worktree', 'add', '/repo/.worktrees/issue-1769', 'resolve/issue-1769-custom'],
    ]);
    expect(findConflictingIssuePrs(plan, [
      { number: 2337, headRefName: 'resolve/issue-1769-custom', url: 'https://example.test/pr/2337' },
    ])).toEqual([]);
    expect(findConflictingIssuePrs(plan, [
      { number: 2338, headRefName: 'resolve/issue-1769-other', url: 'https://example.test/pr/2338' },
    ])).toEqual([
      { number: 2338, headRefName: 'resolve/issue-1769-other', url: 'https://example.test/pr/2338' },
    ]);
  });

  it('derives remote-specific default bases and caps long title slugs', () => {
    const plan = buildIssueWorktreePlan({
      issue: 2000,
      title: 'a'.repeat(256),
      remote: 'upstream',
      cwd: '/repo',
    });

    expect(plan.base).toBe('upstream/main');
    expect(plan.commands.preflight).toContainEqual(['git', 'fetch', 'upstream', 'main']);
    expect(plan.titleSlug).toHaveLength(96);
    expect(plan.branch).toHaveLength('resolve/issue-2000-'.length + 96);
  });

  it('rejects invalid issue numbers and unsafe refs before building commands', () => {
    expect(() => parseIssueNumber('abc')).toThrow(/positive integer/u);
    expect(() => buildIssueWorktreePlan({ issue: 0, title: 'bad' })).toThrow(/positive integer/u);
    expect(() => buildIssueWorktreePlan({ issue: 1, title: 'bad', branch: '../main' })).toThrow(/Unsafe branch/u);
    expect(() => buildIssueWorktreePlan({ issue: 1, title: 'bad', branch: '-main' })).toThrow(/Unsafe branch/u);
    expect(() => buildIssueWorktreePlan({ issue: 1, title: 'bad', base: '-main' })).toThrow(/Unsafe base/u);
    expect(() => buildIssueWorktreePlan({ issue: 1, title: 'bad', repo: 'not-a-repo' })).toThrow(/OWNER\/REPO/u);
  });

  it('renders copyable dry-run commands and structured fields for coordinator handoffs', () => {
    const plan = buildIssueWorktreePlan({
      issue: 1769,
      title: 'feat(onboarding): add issue-to-worktree bootstrap helper',
      cwd: '/repo',
    });
    const output = renderPlan(plan);

    expect(output).toContain('Issue: #1769');
    expect(output).toContain('Branch: resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper');
    expect(output).toContain('Worktree: /resolve-wt/issue-1769');
    expect(output).toContain('git worktree add -b resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper /resolve-wt/issue-1769 origin/main');
  });

  it('prints JSON in dry-run mode without requiring git or GitHub mutation', () => {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--dry-run',
      '--json',
      '--issue', '1769',
      '--title', 'feat(onboarding): add issue-to-worktree bootstrap helper',
      '--worktree-root', '.worktrees',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      dryRun: boolean;
      issue: number;
      branch: string;
      worktreePath: string;
      commands: { duplicateChecks: string[][] };
    };
    expect(parsed.dryRun).toBe(true);
    expect(parsed.issue).toBe(1769);
    expect(parsed.branch).toBe('resolve/issue-1769-feat-onboarding-add-issue-to-worktree-bootstrap-helper');
    expect(parsed.worktreePath).toBe(resolve(ROOT, '.worktrees', 'issue-1769'));
    expect(parsed.commands.duplicateChecks[0]).toContain('gh');
  });

  it('keeps slug fallback deterministic for punctuation-only titles', () => {
    expect(slugifyTitle('!!!')).toBe('issue-worktree');
  });

  it('documents the helper in package scripts and onboarding guides', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const onboarding = readFileSync(resolve(ROOT, 'ONBOARDING.md'), 'utf8');
    const issueGuide = readFileSync(resolve(ROOT, 'docs/guides/fix-github-issues.md'), 'utf8');

    expect(packageJson.scripts?.['issue:worktree']).toBe('node scripts/issue-worktree-bootstrap.mjs');
    for (const doc of [onboarding, issueGuide]) {
      expect(doc).toContain('npm run issue:worktree -- --dry-run --issue 1769');
      expect(doc).toContain('resolve/issue-<number>-<slug>');
      expect(doc).toContain('David Mendez <me@davidmendez.dev>');
      expect(doc).toContain('--reuse --branch <existing-branch>');
    }
  });
});
