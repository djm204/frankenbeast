import { describe, it, expect } from 'vitest';
import {
  ApprovalAnomalyDetector,
  formatApprovalAnomalyAcknowledgementToken,
  hasApprovalAnomalyAcknowledgement,
} from '../../../src/security/approval-anomaly-detector.js';
import type { ApprovalRequest } from '../../../src/core/types.js';

function makeRequest(
  requestId: string,
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
    requestId,
    taskId: 'worker-1',
    projectId: 'project-1',
    trigger: { triggered: true, triggerId: 'hitl', reason: 'operator approval', severity: 'high' },
    summary: 'git push --force-with-lease origin HEAD:refs/heads/main',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
    metadata: {
      workerId: 'worker-1',
      workdir: '/repo/a',
      commandClass: 'git-remote-write',
      command: 'git push --force-with-lease origin HEAD:refs/heads/main',
      force: true,
      destructive: true,
      ...(overrides.metadata ?? {}),
    },
  };
}

describe('ApprovalAnomalyDetector', () => {
  it('does not flag normal batch approvals below the configured thresholds', () => {
    const detector = new ApprovalAnomalyDetector({
      maxApprovalsPerWindow: 10,
      maxUniqueWorkdirsPerWindow: 4,
      maxRepeatedDestructiveCommands: 3,
      maxRapidRetries: 4,
    });

    const first = detector.record(makeRequest('req-1', {
      metadata: {
        workerId: 'worker-1',
        workdir: '/repo/a',
        commandClass: 'github-mutation',
        command: 'gh issue edit 1738 --add-label enriched',
        destructive: false,
      },
    }));
    const second = detector.record(makeRequest('req-2', {
      timestamp: new Date('2026-01-01T00:00:05Z'),
      metadata: {
        workerId: 'worker-2',
        workdir: '/repo/b',
        commandClass: 'github-mutation',
        command: 'gh issue comment 1738 --body done',
        destructive: false,
      },
    }));

    expect(first.flagged).toBe(false);
    expect(second.flagged).toBe(false);
  });

  it('flags repeated destructive commands by worker, workdir, command class, and time window', () => {
    const detector = new ApprovalAnomalyDetector({ maxRepeatedDestructiveCommands: 3 });

    detector.record(makeRequest('req-1'));
    detector.record(makeRequest('req-2', { timestamp: new Date('2026-01-01T00:00:10Z') }));
    const decision = detector.record(makeRequest('req-3', { timestamp: new Date('2026-01-01T00:00:20Z') }));

    expect(decision.flagged).toBe(true);
    expect(decision.findings.map((finding) => finding.ruleId)).toContain('repeated-destructive-command');
    expect(decision.findings[0]?.evidence).toMatchObject({
      workerId: 'worker-1',
      workdir: '/repo/a',
      commandClass: 'git-remote-write',
      count: 3,
    });
  });

  it('flags a worker requesting approvals from too many unique workdirs', () => {
    const detector = new ApprovalAnomalyDetector({ maxUniqueWorkdirsPerWindow: 2 });

    detector.record(makeRequest('req-1', { metadata: { workdir: '/repo/a', command: 'gh pr merge 1' } }));
    detector.record(makeRequest('req-2', {
      timestamp: new Date('2026-01-01T00:00:05Z'),
      metadata: { workdir: '/repo/b', command: 'gh pr merge 2' },
    }));
    const decision = detector.record(makeRequest('req-3', {
      timestamp: new Date('2026-01-01T00:00:10Z'),
      metadata: { workdir: '/repo/c', command: 'gh pr merge 3' },
    }));

    expect(decision.flagged).toBe(true);
    expect(decision.findings.map((finding) => finding.ruleId)).toContain('many-unique-workdirs');
    expect(decision.findings.find((finding) => finding.ruleId === 'many-unique-workdirs')?.evidence.uniqueWorkdirs)
      .toEqual(['/repo/a', '/repo/b', '/repo/c']);
  });

  it('flags rapid retry loops for the same command fingerprint', () => {
    const detector = new ApprovalAnomalyDetector({ maxRapidRetries: 4, retryWindowMs: 60_000 });

    for (let index = 1; index <= 3; index += 1) {
      detector.record(makeRequest(`req-${index}`, {
        timestamp: new Date(`2026-01-01T00:00:0${index}Z`),
        metadata: { commandClass: 'github-mutation', command: 'gh pr merge 1738 --squash' },
      }));
    }
    const decision = detector.record(makeRequest('req-4', {
      timestamp: new Date('2026-01-01T00:00:04Z'),
      metadata: { commandClass: 'github-mutation', command: 'gh pr merge 1738 --squash' },
    }));

    expect(decision.flagged).toBe(true);
    expect(decision.findings.map((finding) => finding.ruleId)).toContain('rapid-retry-loop');
  });

  it('formats deterministic acknowledgement tokens per request', () => {
    const request = makeRequest('req-ack');
    const decision = new ApprovalAnomalyDetector().record(request);

    expect(decision.acknowledgementToken).toBe(formatApprovalAnomalyAcknowledgementToken(decision.evidence));
    expect(decision.acknowledgementToken).toBe('ACK-APPROVAL-ANOMALY-cmVxLWFjaw');
  });

  it('ignores caller-supplied acknowledgement metadata and only accepts response feedback', () => {
    const request = makeRequest('req-ack', {
      metadata: { approvalAnomalyAcknowledgement: 'ACK-APPROVAL-ANOMALY-req-ack' },
    });
    const decision = new ApprovalAnomalyDetector().record(request);

    expect(hasApprovalAnomalyAcknowledgement(request, {
      requestId: 'req-ack',
      decision: 'APPROVE',
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:05Z'),
    }, decision)).toBe(false);
    expect(hasApprovalAnomalyAcknowledgement(request, {
      requestId: 'req-ack',
      decision: 'APPROVE',
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:05Z'),
      feedback: 'reviewed ACK-APPROVAL-ANOMALY-cmVxLWFjaw',
    }, decision)).toBe(true);
  });

  it('uses trusted receipt time instead of caller-supplied request timestamps for windows', () => {
    const detector = new ApprovalAnomalyDetector({ maxApprovalsPerWindow: 1 });

    detector.record(makeRequest('req-old', { timestamp: new Date('2020-01-01T00:00:00Z') }), 1_000);
    const decision = detector.record(makeRequest('req-new', {
      timestamp: new Date('2030-01-01T00:00:00Z'),
      metadata: { command: 'gh issue comment 1 --body ok', destructive: false },
    }), 1_001);

    expect(decision.flagged).toBe(true);
    expect(decision.findings.map((finding) => finding.ruleId)).toContain('approval-volume');
  });

  it('does not let untrusted non-destructive metadata suppress high-risk command classes', () => {
    const detector = new ApprovalAnomalyDetector({ maxRepeatedDestructiveCommands: 2 });
    const metadata = {
      workerId: 'worker-1',
      workdir: '/repo/a',
      commandClass: 'git-remote-write',
      command: 'git push --force-with-lease',
      destructive: false,
      readOnly: true,
    };

    detector.record(makeRequest('req-1', { metadata }));
    const decision = detector.record(makeRequest('req-2', {
      timestamp: new Date('2026-01-01T00:00:05Z'),
      metadata,
    }));

    expect(decision.findings.map((finding) => finding.ruleId)).toContain('repeated-destructive-command');
  });

  it('scans command metadata when destructive flags and command class are omitted', () => {
    const detector = new ApprovalAnomalyDetector({ maxRepeatedDestructiveCommands: 2 });
    const metadata = {
      workerId: 'worker-1',
      workdir: '/repo/a',
      command: 'git push --force-with-lease',
    };

    detector.record(makeRequest('req-1', { metadata }));
    const decision = detector.record(makeRequest('req-2', {
      timestamp: new Date('2026-01-01T00:00:05Z'),
      metadata,
    }));

    expect(decision.findings.map((finding) => finding.ruleId)).toContain('repeated-destructive-command');
  });

  it('matches acknowledgement tokens exactly and supports request-id delimiters', () => {
    const request = makeRequest('job:123');
    const decision = new ApprovalAnomalyDetector().record(request);

    expect(hasApprovalAnomalyAcknowledgement(request, {
      requestId: 'job:123',
      decision: 'APPROVE',
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:05Z'),
      feedback: 'ACK-APPROVAL-ANOMALY-am9iOjEyMw-extra',
    }, { ...decision, flagged: true })).toBe(false);
    expect(hasApprovalAnomalyAcknowledgement(request, {
      requestId: 'job:123',
      decision: 'APPROVE',
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:05Z'),
      feedback: 'reviewed ACK-APPROVAL-ANOMALY-am9iOjEyMw, proceed',
    }, { ...decision, flagged: true })).toBe(true);
  });

  it('rejects invalid tuning values that would disable anomaly checks', () => {
    expect(() => new ApprovalAnomalyDetector({ windowMs: -1 })).toThrow(/positive integer/u);
    expect(() => new ApprovalAnomalyDetector({ maxRapidRetries: Number.NaN })).toThrow(/positive integer/u);
  });
});
