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
          expectedStartTimeTicks: '102-start',
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
        { pid: 102, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '102-start' },
        { pid: 103, command: '/bin/bash', args: ['-lc', 'sleep 60'], cwd: '/repo', uid: 1000 },
        { pid: 104, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/tmp/other', uid: 1000 },
        { pid: 202, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '102-start' },
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
    expect(report.operatorSummary).toContain('No orphan duplicate termination is planned without matching uid, cwd, command, args, and process-start evidence');
  });

  it('requires full recorded process evidence before marking a PID clean', () => {
    const report = buildProcessCleanupPlan({
      checkedAt: '2026-07-16T12:00:00.000Z',
      dryRun: true,
      currentUid: 1000,
      attempts: [
        {
          runId: 'run-duplicate-a',
          attemptId: 'attempt-duplicate-a',
          status: 'running',
          pid: 401,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
        {
          runId: 'run-duplicate-b',
          attemptId: 'attempt-duplicate-b',
          status: 'running',
          pid: 401,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
        },
        {
          runId: 'run-wrong-uid',
          attemptId: 'attempt-wrong-uid',
          status: 'running',
          pid: 402,
          expectedCommand: '/usr/bin/node',
          expectedCwd: '/repo',
          expectedUid: 1000,
        },
        {
          runId: 'run-wrong-args',
          attemptId: 'attempt-wrong-args',
          status: 'running',
          pid: 403,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
        },
        {
          runId: 'run-wrong-start',
          attemptId: 'attempt-wrong-start',
          status: 'running',
          pid: 404,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
          expectedStartTimeTicks: '100',
        },
      ],
      processes: [
        { pid: 401, command: '/usr/bin/node', args: [], cwd: '/repo', uid: 1000 },
        { pid: 402, command: '/usr/bin/node', args: [], cwd: '/repo', uid: 2000 },
        { pid: 403, command: '/usr/bin/node', args: ['dist/cli/run.js', 'other'], cwd: '/repo', uid: 1000 },
        { pid: 404, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '200' },
      ],
    });

    expect(report.status).toBe('review-required');
    expect(report.findings.map((finding) => finding.code)).toEqual([
      'duplicate-recorded-pid',
      'duplicate-recorded-pid',
      'wrong-uid',
      'wrong-args',
      'wrong-start-time',
    ]);
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'live-matching-worker' }),
    ]));
  });

  it('does not treat a process with trailing args as a matching worker', () => {
    const report = buildProcessCleanupPlan({
      checkedAt: '2026-07-16T12:00:00.000Z',
      dryRun: true,
      currentUid: 1000,
      attempts: [
        {
          runId: 'run-extra-args',
          attemptId: 'attempt-extra-args',
          status: 'running',
          pid: 501,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
          expectedStartTimeTicks: '501-start',
        },
      ],
      processes: [
        { pid: 501, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast', '--other-card'], cwd: '/repo', uid: 1000, startTimeTicks: '501-start' },
      ],
    });

    expect(report.findings.map((finding) => finding.code)).toEqual(['wrong-args']);
    expect(report.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'terminate-orphan' }),
    ]));
  });

  it('requires process-start evidence before matching workers or planning orphan cleanup', () => {
    const report = buildProcessCleanupPlan({
      checkedAt: '2026-07-16T12:00:00.000Z',
      dryRun: true,
      currentUid: 1000,
      attempts: [
        {
          runId: 'run-no-start-token',
          attemptId: 'attempt-no-start-token',
          status: 'running',
          pid: 601,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
        },
      ],
      processes: [
        { pid: 601, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '601-start' },
        { pid: 602, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '602-start' },
      ],
    });

    expect(report.findings.map((finding) => finding.code)).toEqual(['wrong-start-time']);
    expect(report.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'terminate-orphan' }),
    ]));
  });

  it('skips orphan cleanup when recorded PID ownership is duplicated', () => {
    const report = buildProcessCleanupPlan({
      checkedAt: '2026-07-16T12:00:00.000Z',
      dryRun: true,
      currentUid: 1000,
      attempts: [
        {
          runId: 'run-duplicate-a',
          attemptId: 'attempt-duplicate-a',
          status: 'running',
          pid: 701,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
          expectedStartTimeTicks: '701-start',
        },
        {
          runId: 'run-duplicate-b',
          attemptId: 'attempt-duplicate-b',
          status: 'running',
          pid: 701,
          expectedCommand: '/usr/bin/node',
          expectedArgs: ['dist/cli/run.js', 'beast'],
          expectedCwd: '/repo',
          expectedStartTimeTicks: '701-start',
        },
      ],
      processes: [
        { pid: 701, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '701-start' },
        { pid: 702, command: '/usr/bin/node', args: ['dist/cli/run.js', 'beast'], cwd: '/repo', uid: 1000, startTimeTicks: '701-start' },
      ],
    });

    expect(report.findings.map((finding) => finding.code)).toEqual([
      'duplicate-recorded-pid',
      'duplicate-recorded-pid',
    ]);
    expect(report.actions.filter((action) => action.action === 'terminate-orphan')).toHaveLength(0);
  });
});
