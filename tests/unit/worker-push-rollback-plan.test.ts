import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildRollbackPlan,
  findRemoteHead,
  parseLsRemoteHeads,
} from '../../scripts/worker-push-rollback-plan.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/worker-push-rollback-plan.mjs');
const REMOTE_HEAD = '1111111111111111111111111111111111111111';
const LAST_GOOD = '2222222222222222222222222222222222222222';

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
      'git ls-remote --heads origin resolve/issue-1720-feat-dr',
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
      'gh pr comment 1720 --repo djm204/frankenbeast --body-file rollback-evidence/resolve-issue-1720-feat-dr/rollback-comment.md',
    );
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
    expect(result.stdout).toContain('git ls-remote --heads origin resolve/issue-1720-feat-dr');
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
