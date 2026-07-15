import { describe, expect, it } from 'vitest';
import {
  evaluateHighRiskActionPolicy,
  HIGH_RISK_ACTION_CLASSES,
  isHighRiskActionClass,
  type HighRiskActionClass,
  type HighRiskActionEvidence,
  type HighRiskPolicyDecisionKind,
} from '../../../src/security/high-risk-action-policy.js';

interface DecisionCase {
  readonly actionClass: HighRiskActionClass;
  readonly decision: HighRiskPolicyDecisionKind;
  readonly evidence: HighRiskActionEvidence;
  readonly reason: RegExp;
}

describe('high-risk action policy', () => {
  it('enumerates every covered high-risk action class', () => {
    expect(HIGH_RISK_ACTION_CLASSES).toEqual([
      'git-remote-write',
      'github-mutation',
      'cron',
      'memory',
      'profile-write',
      'webhook',
      'shell-process-control',
    ]);
    expect(isHighRiskActionClass('cron')).toBe(true);
    expect(isHighRiskActionClass('read-only-search')).toBe(false);
  });

  it.each<DecisionCase>([
    {
      actionClass: 'git-remote-write',
      decision: 'allow',
      evidence: { readOnly: true, command: 'git remote -v' },
      reason: /read-only|dry-run/u,
    },
    {
      actionClass: 'git-remote-write',
      decision: 'deny',
      evidence: { command: 'git push origin HEAD' },
      reason: /missing a concrete remote\/ref target/u,
    },
    {
      actionClass: 'git-remote-write',
      decision: 'needs-approval',
      evidence: { target: 'origin main', command: 'git push --force-with-lease origin HEAD:main', force: true },
      reason: /force-push|history rewrite/u,
    },
    {
      actionClass: 'github-mutation',
      decision: 'allow',
      evidence: { operation: 'read', target: 'pulls/1' },
      reason: /read-only GitHub/iu,
    },
    {
      actionClass: 'github-mutation',
      decision: 'deny',
      evidence: { target: 'issues/1704' },
      reason: /missing the mutation operation/u,
    },
    {
      actionClass: 'github-mutation',
      decision: 'needs-approval',
      evidence: { operation: 'merge-pr', target: 'pulls/2301' },
      reason: /GitHub mutation/u,
    },
    {
      actionClass: 'cron',
      decision: 'allow',
      evidence: { operation: 'list', readOnly: true },
      reason: /read-only/u,
    },
    {
      actionClass: 'cron',
      decision: 'deny',
      evidence: {},
      reason: /explicit create, update, pause, resume, remove, or run operation/u,
    },
    {
      actionClass: 'cron',
      decision: 'needs-approval',
      evidence: { operation: 'create', target: 'every 10m' },
      reason: /durable autonomous execution/u,
    },
    {
      actionClass: 'memory',
      decision: 'allow',
      evidence: { operation: 'read', readOnly: true },
      reason: /does not alter/u,
    },
    {
      actionClass: 'memory',
      decision: 'deny',
      evidence: { operation: 'add', crossProfile: true, profile: 'other' },
      reason: /Cross-profile memory edits/u,
    },
    {
      actionClass: 'memory',
      decision: 'needs-approval',
      evidence: { operation: 'replace', profile: 'default' },
      reason: /persist across future sessions/u,
    },
    {
      actionClass: 'profile-write',
      decision: 'allow',
      evidence: { readOnly: true, profile: 'default' },
      reason: /read-only/u,
    },
    {
      actionClass: 'profile-write',
      decision: 'deny',
      evidence: { profile: 'other', activeProfile: 'default' },
      reason: /Cross-profile writes/u,
    },
    {
      actionClass: 'profile-write',
      decision: 'needs-approval',
      evidence: { profile: 'default', activeProfile: 'default', operation: 'write-skill' },
      reason: /skills, plugins, credentials, or runtime behavior/u,
    },
    {
      actionClass: 'webhook',
      decision: 'allow',
      evidence: { dryRun: true, url: 'https://discord.test/webhook' },
      reason: /dry-run/u,
    },
    {
      actionClass: 'webhook',
      decision: 'deny',
      evidence: { url: 'https://evil.test/webhook', allowlisted: false },
      reason: /not allowlisted/u,
    },
    {
      actionClass: 'webhook',
      decision: 'needs-approval',
      evidence: { url: 'https://discord.test/webhook', allowlisted: true },
      reason: /disclose data/u,
    },
    {
      actionClass: 'shell-process-control',
      decision: 'allow',
      evidence: { readOnly: true, command: 'ps aux' },
      reason: /Read-only process inspection/u,
    },
    {
      actionClass: 'shell-process-control',
      decision: 'deny',
      evidence: {},
      reason: /missing the exact command/u,
    },
    {
      actionClass: 'shell-process-control',
      decision: 'needs-approval',
      evidence: { command: 'pkill -f worker', destructive: true },
      reason: /start, stop, kill, or mutate/u,
    },
  ])('returns $decision for $actionClass with reviewable reason and evidence', ({ actionClass, decision, evidence, reason }) => {
    const result = evaluateHighRiskActionPolicy({ actionClass, evidence });

    expect(result).toEqual({
      actionClass,
      decision,
      evidence,
      reason: expect.stringMatching(reason),
    });
  });
});
