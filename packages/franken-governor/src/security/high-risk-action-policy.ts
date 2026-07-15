export const HIGH_RISK_ACTION_CLASSES = [
  'git-remote-write',
  'github-mutation',
  'cron',
  'memory',
  'profile-write',
  'webhook',
  'shell-process-control',
] as const;

export type HighRiskActionClass = (typeof HIGH_RISK_ACTION_CLASSES)[number];

export type HighRiskPolicyDecisionKind = 'allow' | 'deny' | 'needs-approval';

export interface HighRiskActionEvidence {
  readonly actor?: string;
  readonly command?: string;
  readonly target?: string;
  readonly operation?: string;
  readonly profile?: string;
  readonly activeProfile?: string;
  readonly url?: string;
  readonly allowlisted?: boolean;
  readonly dryRun?: boolean;
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly force?: boolean;
  readonly crossProfile?: boolean;
}

export interface HighRiskActionPolicyInput {
  readonly actionClass: HighRiskActionClass;
  readonly evidence?: HighRiskActionEvidence;
}

export interface HighRiskActionPolicyDecision {
  readonly decision: HighRiskPolicyDecisionKind;
  readonly actionClass: HighRiskActionClass;
  readonly reason: string;
  readonly evidence: HighRiskActionEvidence;
}

type PolicyRule = (evidence: HighRiskActionEvidence) => Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'>;

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

const HIGH_RISK_POLICY_RULES: Record<HighRiskActionClass, PolicyRule> = {
  'git-remote-write': evaluateGitRemoteWrite,
  'github-mutation': evaluateGithubMutation,
  cron: evaluateCronChange,
  memory: evaluateMemoryChange,
  'profile-write': evaluateProfileWrite,
  webhook: evaluateWebhookSend,
  'shell-process-control': evaluateShellProcessControl,
};

/**
 * Central policy-as-code decision point for agent actions whose side effects are
 * too risky to guard with scattered string checks. Callers pass normalized
 * action evidence and receive a reviewable allow/deny/needs-approval outcome.
 */
export function evaluateHighRiskActionPolicy(input: HighRiskActionPolicyInput): HighRiskActionPolicyDecision {
  const evidence = input.evidence ?? {};
  const rule = HIGH_RISK_POLICY_RULES[input.actionClass];
  const decision = rule(evidence);

  return {
    actionClass: input.actionClass,
    evidence,
    ...decision,
  };
}

export function isHighRiskActionClass(value: string): value is HighRiskActionClass {
  return HIGH_RISK_ACTION_CLASSES.includes(value as HighRiskActionClass);
}

function evaluateGitRemoteWrite(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  if (evidence.readOnly === true || evidence.dryRun === true) {
    return { decision: 'allow', reason: 'Read-only or dry-run git operation has no remote write side effect.' };
  }
  if (!hasText(evidence.command)) {
    return { decision: 'deny', reason: 'Git remote write is missing the exact git command.' };
  }
  if (!hasText(evidence.target)) {
    return { decision: 'deny', reason: 'Git remote write is missing a concrete remote/ref target.' };
  }
  return {
    decision: 'needs-approval',
    reason: evidence.force === true
      ? 'Git force-push or history rewrite requires exact-command approval.'
      : 'Git remote write requires operator approval before mutating a remote repository.',
  };
}

function evaluateGithubMutation(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  if (evidence.readOnly === true || evidence.operation === 'read') {
    return { decision: 'allow', reason: 'Read-only GitHub API operation does not mutate repository state.' };
  }
  if (!hasText(evidence.operation)) {
    return { decision: 'deny', reason: 'GitHub mutation is missing the mutation operation name.' };
  }
  if (!hasText(evidence.target)) {
    return { decision: 'deny', reason: 'GitHub mutation is missing the issue, PR, workflow, or repository target.' };
  }
  return { decision: 'needs-approval', reason: 'GitHub mutation can change issues, PRs, checks, labels, or repo settings.' };
}

function evaluateCronChange(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  if (evidence.readOnly === true || evidence.operation === 'list') {
    return { decision: 'allow', reason: 'Cron listing is read-only.' };
  }
  if (!hasText(evidence.operation)) {
    return { decision: 'deny', reason: 'Cron policy requires an explicit create, update, pause, resume, remove, or run operation.' };
  }
  if (!hasText(evidence.target)) {
    return { decision: 'deny', reason: 'Cron policy requires a concrete job id or schedule target.' };
  }
  return { decision: 'needs-approval', reason: 'Cron changes can create durable autonomous execution.' };
}

function evaluateMemoryChange(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  if (evidence.readOnly === true || evidence.operation === 'read') {
    return { decision: 'allow', reason: 'Memory read does not alter durable agent context.' };
  }
  if (evidence.dryRun === true) {
    return { decision: 'allow', reason: 'Memory dry-run does not alter durable agent context.' };
  }
  if (evidence.crossProfile === true) {
    return { decision: 'deny', reason: 'Cross-profile memory edits are denied unless routed through an explicit profile-owner workflow.' };
  }
  if (hasText(evidence.profile) && hasText(evidence.activeProfile) && evidence.profile!.trim() !== evidence.activeProfile!.trim()) {
    return { decision: 'deny', reason: 'Cross-profile memory edits are denied unless routed through an explicit profile-owner workflow.' };
  }
  if ((hasText(evidence.profile) && !hasText(evidence.activeProfile)) || (!hasText(evidence.profile) && hasText(evidence.activeProfile))) {
    return { decision: 'deny', reason: 'Memory policy requires both requested and active profile evidence when profile scope is provided.' };
  }
  if (!hasText(evidence.operation)) {
    return { decision: 'deny', reason: 'Memory edit is missing an explicit add, replace, delete, or right-to-forget operation.' };
  }
  return { decision: 'needs-approval', reason: 'Memory edits persist across future sessions and require reviewable approval.' };
}

function evaluateProfileWrite(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  const requestedProfile = evidence.profile?.trim();
  const activeProfile = evidence.activeProfile?.trim();

  if (evidence.readOnly === true) {
    return { decision: 'allow', reason: 'Profile inspection is read-only.' };
  }
  if (evidence.crossProfile === true) {
    return { decision: 'deny', reason: 'Cross-profile writes are denied by default.' };
  }
  if (!hasText(requestedProfile) || !hasText(activeProfile)) {
    return { decision: 'deny', reason: 'Profile-write policy requires both requested and active profile evidence.' };
  }
  if (requestedProfile !== activeProfile) {
    return { decision: 'deny', reason: 'Cross-profile writes are denied by default.' };
  }
  if (!hasText(evidence.operation)) {
    return { decision: 'deny', reason: 'Profile-write policy requires an explicit write intent such as skill, plugin, credential, cron, or config update.' };
  }
  return { decision: 'needs-approval', reason: 'Profile writes can alter skills, plugins, credentials, or runtime behavior.' };
}

function evaluateWebhookSend(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  if (evidence.dryRun === true) {
    return { decision: 'allow', reason: 'Webhook dry-run does not send data to a remote endpoint.' };
  }
  if (evidence.url === undefined || evidence.url.trim() === '') {
    return { decision: 'deny', reason: 'Webhook send is missing a destination URL.' };
  }
  if (evidence.allowlisted !== true) {
    return { decision: 'deny', reason: 'Webhook destination is not allowlisted.' };
  }
  return { decision: 'needs-approval', reason: 'Webhook send can disclose data to an external service.' };
}

function evaluateShellProcessControl(evidence: HighRiskActionEvidence): Omit<HighRiskActionPolicyDecision, 'actionClass' | 'evidence'> {
  if (evidence.readOnly === true && evidence.destructive !== true) {
    return { decision: 'allow', reason: 'Read-only process inspection is allowed.' };
  }
  if (evidence.command === undefined || evidence.command.trim() === '') {
    return { decision: 'deny', reason: 'Shell/process-control action is missing the exact command.' };
  }
  return { decision: 'needs-approval', reason: 'Shell process control can start, stop, kill, or mutate local processes and files.' };
}
