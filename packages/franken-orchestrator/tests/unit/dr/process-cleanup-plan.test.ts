import { describe, expect, it } from 'vitest';
import {
  buildProcessCleanupPlan,
  renderProcessCleanupDryRunPlan,
} from '../../../src/dr/process-cleanup-plan.js';

describe('process cleanup plan', () => {
  it('distinguishes missing, stale, live, wrong-command, wrong-cwd, and orphan duplicate process states', () => {
    const report = buildProcessCleanupPlan({
      checkedAt: '2026-07-16T12:00:00.000Z',
      dryRun: true,
      currentUid: 1000,
      attempts: [
        {
          runId: 'run-missing-pid',
          attemptId: 'attempt-missing-pid',
          status: 'running',
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
        {
          runId: 'run-stale-pid',
          attemptId: 'attempt-stale-pid',
          status: 'running',
          pid: 101,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
        {
          runId: 'run-live',
          attemptId: 'attempt-live',
          status: 'running',
          pid: 102,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
        },
        {
          runId: 'run-wrong-command',
          attemptId: 'attempt-wrong-command',
          status: 'running',
          pid: 103,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
        {
          runId: 'run-wrong-cwd',
          attemptId: 'attempt-wrong-cwd',
          status: 'running',
          pid: 104,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
      ],
      processes: [
        { pid: 102, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000 },
        { pid: 103, command: '/bin/bash', args: ['-lc', 'sleep 60'], cwd: '/repo', uid: 1000 },
        { pid: 104, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/tmp/other', uid: 1000 },
        { pid: 202, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000 },
      ],
    });

    expect(report.wouldWrite).toBe(false);
    expect(report.status).toBe('review-required');
    expect(report.findings.map((finding) => finding.code)).toEqual([
      'missing-pid',
      'stale-pid',
      'live-matching-worker',
      'wrong-command',
      'wrong-cwd',
      'orphan-duplicate-process',
    ]);
    expect(report.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'clear-stale-pid', pid: 101, requiresApproval: false }),
      expect.objectContaining({ action: 'terminate-orphan', pid: 202, requiresApproval: true, wouldExecute: false }),
    ]));
    expect(report.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ pid: 103, action: 'terminate-orphan' }),
      expect.objectContaining({ pid: 104, action: 'terminate-orphan' }),
    ]));

    const dryRun = renderProcessCleanupDryRunPlan(report);
    expect(dryRun).toContain('DR process cleanup dry-run: review-required');
    expect(dryRun).toContain('clear-stale-pid pid=101');
    expect(dryRun).toContain('terminate-orphan pid=202 approval=required dry-run');
    expect(dryRun).toContain('wrong-command');
    expect(dryRun).toContain('wrong-cwd');
  });

  it('requires uid, cwd, and command evidence before planning orphan termination', () => {
    const report = buildProcessCleanupPlan({
      checkedAt: '2026-07-16T12:00:00.000Z',
      dryRun: true,
      currentUid: 1000,
      attempts: [
        {
          runId: 'run-live',
          attemptId: 'attempt-live',
          status: 'running',
          pid: 301,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
      ],
      processes: [
        { pid: 301, command: '/usr/bin/node', args: [], cwd: '/repo', uid: 1000 },
        { pid: 302, command: '/usr/bin/node', args: [], cwd: '/repo', uid: 2000 },
        { pid: 303, command: '/usr/bin/node', args: [], cwd: undefined, uid: 1000 },
        { pid: 304, command: '/usr/bin/node', args: [], cwd: '/other', uid: 1000 },
        { pid: 305, command: '/bin/bash', args: [], cwd: '/repo', uid: 1000 },
      ],
    });

    expect(report.findings.filter((finding) => finding.code === 'orphan-duplicate-process')).toHaveLength(0);
    expect(report.actions.filter((action) => action.action === 'terminate-orphan')).toHaveLength(0);
    expect(report.operatorSummary).toContain('No orphan duplicate termination is planned without matching uid, cwd, and command evidence');
  });
});
