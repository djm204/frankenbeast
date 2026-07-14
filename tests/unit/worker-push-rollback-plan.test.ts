import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertRollbackBranch,
  buildRollbackPlan,
  findRemoteHead,
  parseLsRemoteHeads,
} from '../../scripts/worker-push-rollback-plan.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/worker-push-rollback-plan.mjs');
const REMOTE_HEAD = '1111111111111111111111111111111111111111';
const LAST_GOOD = '2222222222222222222222222222222222222222';
const BRANCH_SLUG = 'resolve-issue-1720-feat-dr-42ef95ea';

describe('worker push rollback dry-run helper', () => {
  it('parses ls-remote branch heads and selects the requested branch', () => {
    const output = [
      `${REMOTE_HEAD}\trefs/heads/resolve/issue-1720-feat-dr`,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/heads/main',
      '',
    ].join('\n');

    expect(parseLsRemoteHeads(output)).toEqual([
      {
        oid: REMOTE_HEAD,
        ref: 'refs/heads/resolve/issue-1720-feat-dr',
        branch: 'resolve/issue-1720-feat-dr',
      },
      {
        oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ref: 'refs/heads/main',
        branch: 'main',
      },
    ]);
    expect(findRemoteHead(output, 'resolve/issue-1720-feat-dr')?.oid).toBe(REMOTE_HEAD);
    expect(findRemoteHead(output, 'missing')).toBeNull();
  });

  it('rejects malformed remote-ref evidence', () => {
    expect(() => parseLsRemoteHeads('not-a-sha refs/heads/main')).toThrow(/Invalid ls-remote/u);
    expect(() => parseLsRemoteHeads(`${REMOTE_HEAD}\trefs/tags/v1`)).toThrow(/Invalid ls-remote/u);
  });

  it('rejects protected rollback targets', () => {
    expect(() => assertRollbackBranch('main')).toThrow(/protected/u);
    expect(() => assertRollbackBranch('release/2026-07-14')).toThrow(/protected/u);
    expect(() => assertRollbackBranch('resolve/issue-1720-feat-dr')).not.toThrow();
  });

  it('builds a dry-run plan that routes the dangerous rollback through approval-cop', () => {
    const plan = buildRollbackPlan({
      branch: 'resolve/issue-1720-feat-dr',
      lastGood: 'origin/main',
      remote: 'origin',
      repo: 'djm204/frankenbeast',
      pr: 1720,
      remoteHeadOid: REMOTE_HEAD,
      lastGoodOid: LAST_GOOD,
    });

    expect(plan.readOnlyCapture.map(command => command.join(' '))).toContain(
      `bash -lc set -o pipefail; git ls-remote --heads "$1" "$2" | tee "$3" -- origin refs/heads/resolve/issue-1720-feat-dr rollback-evidence/${BRANCH_SLUG}/remote-head.txt`,
    );
    expect(plan.readOnlyCapture.map(command => command.join(' '))).toContain(
      `git fetch --force --no-tags origin +refs/heads/resolve/issue-1720-feat-dr:refs/fbeast/rollback-evidence/${BRANCH_SLUG}`,
    );
    expect(plan.readOnlyCapture.map(command => command.join(' '))).toContain(
      `bash -lc set -o pipefail; git rev-parse --verify "$1^{commit}" | tee "$2" -- ${LAST_GOOD} rollback-evidence/${BRANCH_SLUG}/last-good-oid.txt`,
    );
    expect(plan.readOnlyCapture.map(command => command.join(' '))).toContain(
      'bash -lc gh pr view "$1" "${@:3}" --json number,title,state,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup,url > "$2" -- 1720 rollback-evidence/'
        + `${BRANCH_SLUG}/pr-state.json --repo djm204/frankenbeast`,
    );
    const captureCommands = plan.readOnlyCapture.map(command => command[0] === 'bash' ? command[2] : command.join(' '));
    expect(captureCommands.indexOf('git fetch --force --no-tags origin +refs/heads/resolve/issue-1720-feat-dr:refs/fbeast/rollback-evidence/resolve-issue-1720-feat-dr')).toBe(-1);
    expect(plan.readOnlyCapture.findIndex(command => command[0] === 'git' && command[1] === 'fetch')).toBeLessThan(
      plan.readOnlyCapture.findIndex(command => command[0] === 'bash' && command[2].includes('git rev-parse')),
    );
    expect(plan.approvalGatedActions).toEqual([
      [
        'approval-cop',
        'run',
        '--',
        'git',
        'push',
        `--force-with-lease=refs/heads/resolve/issue-1720-feat-dr:${REMOTE_HEAD}`,
        'origin',
        `${LAST_GOOD}:refs/heads/resolve/issue-1720-feat-dr`,
      ],
    ]);
    expect(plan.postRollbackVerification.map(command => command.join(' '))).toContain(
      'gh pr checks 1720 --repo djm204/frankenbeast',
    );
    expect(plan.postRollbackVerification.map(command => command.join(' '))).toContain(
      'bash -lc ! grep -Eq "<(fill before posting|captured-remote-head-oid|resolved-last-good-oid)>" "$1" && gh pr comment "$2" "${@:3}" --body-file "$1" -- rollback-evidence/'
        + `${BRANCH_SLUG}/rollback-comment.md 1720 --repo djm204/frankenbeast`,
    );
  });

  it('uses distinct evidence slugs for branches that sanitize to the same path segment', () => {
    const slashPlan = buildRollbackPlan({ branch: 'feature/foo/bar', lastGood: 'origin/main' });
    const dashPlan = buildRollbackPlan({ branch: 'feature/foo-bar', lastGood: 'origin/main' });

    expect(slashPlan.evidenceDir).not.toBe(dashPlan.evidenceDir);
    expect(slashPlan.readOnlyCapture.map(command => command.join(' ')).join('\n')).not.toContain(
      'refs/fbeast/rollback-evidence/feature-foo-bar ',
    );
  });

  it('rejects blank approval-cop overrides', () => {
    expect(() => buildRollbackPlan({
      branch: 'resolve/issue-1720-feat-dr',
      lastGood: 'origin/main',
      approvalCop: '   ',
    })).toThrow(/approvalCop/u);
  });

  it('prints planned actions in dry-run mode without executing side effects', () => {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--dry-run',
      '--branch', 'resolve/issue-1720-feat-dr',
      '--last-good', 'origin/main',
      '--repo', 'djm204/frankenbeast',
      '--pr', '1720',
      '--remote-head-oid', REMOTE_HEAD,
      '--last-good-oid', LAST_GOOD,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('## 1. Capture read-only evidence');
    expect(result.stdout).toContain('set -o pipefail; git ls-remote --heads "$1" "$2" | tee "$3"');
    expect(result.stdout).toContain('refs/heads/resolve/issue-1720-feat-dr');
    expect(result.stdout).toContain(`refs/fbeast/rollback-evidence/${BRANCH_SLUG}`);
    expect(result.stdout).toContain('rollback-comment.md');
    expect(result.stdout).toContain('gh pr checks 1720 --repo djm204/frankenbeast');
    expect(result.stdout).toContain('approval-cop run -- git push --force-with-lease=refs/heads/resolve/issue-1720-feat-dr:1111111111111111111111111111111111111111 origin 2222222222222222222222222222222222222222:refs/heads/resolve/issue-1720-feat-dr');
    expect(result.stdout).toContain('This helper is dry-run only; it never executes push, force-push, or GitHub mutation commands.');
  });

  it('refuses non-dry-run rollback execution', () => {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--branch', 'resolve/issue-1720-feat-dr',
      '--last-good', 'origin/main',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to run without --dry-run');
  });
});
