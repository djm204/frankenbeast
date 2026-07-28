import { createHash } from 'node:crypto';

export type MissionStageState = 'passed' | 'pending';

export interface MissionIssueStatus {
  issue: number;
  canonicalWorkItemId?: string;
  implementationState: 'implemented' | 'pending';
  reviewedHead: string | null;
  mergeSha: string | null;
  mergedReviewedHead?: string | null;
}

export interface MissionWorkItem {
  id: string;
  kind: 'canonical' | 'recovery' | 'successor' | 'deployment' | 'acceptance' | 'verification' | 'synthesis';
  status: 'todo' | 'ready' | 'running' | 'blocked' | 'done' | 'archived';
  owner: string | null;
  linkedCanonicalId: string | null;
}

export interface MissionExternalGate {
  id: string;
  state: 'pending' | 'passed';
  owner: string | null;
  head: string | null;
  trigger: string | null;
  nextTransition: string | null;
  scope?: MissionExternalGateScope;
}

export type MissionExternalGateScope =
  | { kind: 'issue-reviewed-head'; issue: number }
  | { kind: 'deployed-sha' };

export interface MissionDeploymentStatus {
  state: 'pending' | 'deployed';
  reviewedMainSha: string | null;
  deployedSha: string | null;
  includedMergeShas: string[];
  endpointChecks: Array<{
    endpoint: string;
    status: 'passed' | 'failed';
    checkedAt: string;
    deployedSha?: string;
  }>;
  verifiedAt: string | null;
}

export interface MissionAcceptanceStatus {
  issue3815Passed: boolean;
  authenticatedPublicRealDataPassed: boolean;
  deployedSha: string | null;
  evidenceId: string | null;
  verifiedAt: string | null;
}

export interface MissionCompletionJob {
  id: string;
  missionId: string;
}

export interface MissionCompletionInput {
  missionId: string;
  checkedAt: string;
  evidenceMaxAgeMs: number;
  completionJobs: MissionCompletionJob[];
  alerts: string[];
  scopedIssues: MissionIssueStatus[];
  workItems: MissionWorkItem[];
  requiredExternalGateIds: string[];
  externalGates: MissionExternalGate[];
  deployment: MissionDeploymentStatus;
  acceptance: MissionAcceptanceStatus;
}

export interface MissionCompletionResult {
  missionId: string;
  checkedAt: string;
  evidenceMaxAgeMs: number;
  health: 'healthy-progression' | 'attention-required';
  terminal: boolean;
  shouldStopJobs: boolean;
  jobsToStop: string[];
  stages: {
    implementation: MissionStageState;
    reviewed: MissionStageState;
    merged: MissionStageState;
    deployed: MissionStageState;
    realDataAccepted: MissionStageState;
    completion: MissionStageState;
  };
  summary: string;
  blockers: string[];
  evidence: {
    reviewedHeads: Record<string, string>;
    mergeShas: Record<string, string>;
    deployedSha: string | null;
    endpointChecks: MissionDeploymentStatus['endpointChecks'];
    browserEvidenceId: string | null;
  };
  externalGates: MissionExternalGate[];
  ownership: Array<{
    canonicalId: string;
    canonicalOwner: string | null;
    canonicalStatus: MissionWorkItem['status'];
    linked: Array<{
      id: string;
      kind: Exclude<MissionWorkItem['kind'], 'canonical'>;
      owner: string | null;
      status: MissionWorkItem['status'];
    }>;
  }>;
  stopOnceKey: string | null;
}

export function evaluateMissionCompletion(input: MissionCompletionInput): MissionCompletionResult {
  const hasText = (value: string | null | undefined): value is string => (
    typeof value === 'string' && value.trim().length > 0
  );
  const isGitOid = (value: string | null | undefined): value is string => (
    typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(value)
  );
  const explicitTimestampMs = (value: string | null | undefined): number => {
    if (!hasText(value)) return Number.NaN;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/iu.exec(value);
    if (!match) return Number.NaN;
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
      number, number, number, number, number, number,
    ];
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month - 1, day);
    calendar.setUTCHours(hour, minute, second, 0);
    if (
      calendar.getUTCFullYear() !== year
      || calendar.getUTCMonth() !== month - 1
      || calendar.getUTCDate() !== day
      || calendar.getUTCHours() !== hour
      || calendar.getUTCMinutes() !== minute
      || calendar.getUTCSeconds() !== second
    ) return Number.NaN;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  const checkedAtMs = explicitTimestampMs(input.checkedAt);
  const deploymentVerifiedAtMs = explicitTimestampMs(input.deployment.verifiedAt);
  const acceptanceVerifiedAtMs = explicitTimestampMs(input.acceptance.verifiedAt);
  const timestampIsFresh = (timestampMs: number): boolean => (
    Number.isFinite(timestampMs)
    && Number.isFinite(checkedAtMs)
    && timestampMs <= checkedAtMs
    && checkedAtMs - timestampMs <= input.evidenceMaxAgeMs
  );
  const endpointTimestampsValid = input.deployment.endpointChecks.every((check) => {
    const timestampMs = explicitTimestampMs(check.checkedAt);
    return timestampIsFresh(timestampMs) && timestampMs <= deploymentVerifiedAtMs;
  });
  const deploymentTimestampValid = timestampIsFresh(deploymentVerifiedAtMs);
  const acceptanceTimestampValid = timestampIsFresh(acceptanceVerifiedAtMs)
    && acceptanceVerifiedAtMs >= deploymentVerifiedAtMs;
  const implementation = input.scopedIssues.length > 0
    && input.scopedIssues.every((issue) => {
      if (issue.implementationState !== 'implemented' || !hasText(issue.canonicalWorkItemId)) {
        return false;
      }
      const canonical = input.workItems.find((item) => (
        item.id === issue.canonicalWorkItemId && item.kind === 'canonical'
      ));
      return canonical?.status === 'done';
    });
  const reviewed = input.scopedIssues.length > 0
    && input.scopedIssues.every((issue) => isGitOid(issue.reviewedHead));
  const merged = input.scopedIssues.length > 0
    && input.scopedIssues.every((issue) => (
      isGitOid(issue.mergeSha)
      && isGitOid(issue.mergedReviewedHead)
      && issue.mergedReviewedHead === issue.reviewedHead
    ));
  const reviewedMainIncludesScopedMerges = input.scopedIssues.length > 0
    && input.scopedIssues.every((issue) => (
      hasText(issue.mergeSha) && input.deployment.includedMergeShas.includes(issue.mergeSha)
    ));
  const deployed = input.deployment.state === 'deployed'
    && merged
    && isGitOid(input.deployment.reviewedMainSha)
    && isGitOid(input.deployment.deployedSha)
    && input.deployment.deployedSha === input.deployment.reviewedMainSha
    && reviewedMainIncludesScopedMerges
    && input.deployment.endpointChecks.length > 0
    && input.deployment.endpointChecks.every((check) => (
      check.status === 'passed'
      && hasText(check.endpoint)
      && hasText(check.deployedSha)
      && check.deployedSha === input.deployment.deployedSha
    ))
    && input.deployment.verifiedAt !== null
    && deploymentTimestampValid
    && endpointTimestampsValid;
  const accepted = deployed
    && input.acceptance.issue3815Passed
    && input.acceptance.authenticatedPublicRealDataPassed
    && hasText(input.acceptance.deployedSha)
    && input.acceptance.deployedSha === input.deployment.deployedSha
    && hasText(input.acceptance.evidenceId)
    && input.acceptance.verifiedAt !== null
    && acceptanceTimestampValid;
  const openLinkedWork = input.workItems.filter((item) => (
    item.kind !== 'canonical'
    && item.status !== 'done'
  ));
  const blockers = openLinkedWork.map((item) => (
    `${item.kind} ${item.id} is ${item.status} (owner ${item.owner ?? 'unassigned'}; canonical ${item.linkedCanonicalId ?? 'unlinked'})`
  ));
  if (!hasText(input.missionId)) blockers.push('mission id is blank');
  const workItemIdCounts = new Map<string, number>();
  for (const item of input.workItems) {
    if (!hasText(item.id)) blockers.push('work item id is blank');
    else workItemIdCounts.set(item.id, (workItemIdCounts.get(item.id) ?? 0) + 1);
  }
  for (const [id, count] of workItemIdCounts) {
    if (count > 1) blockers.push(`work item id ${id} is duplicated`);
  }
  const canonicalWorkItemIds = new Set(input.workItems
    .filter((item) => item.kind === 'canonical' && hasText(item.id))
    .map((item) => item.id));
  for (const item of input.workItems) {
    if (item.kind === 'canonical') continue;
    if (!hasText(item.linkedCanonicalId)) {
      blockers.push(`${item.kind} ${item.id} is missing a canonical work item link`);
    } else if (!canonicalWorkItemIds.has(item.linkedCanonicalId)) {
      blockers.push(
        `${item.kind} ${item.id} references missing canonical work item ${item.linkedCanonicalId}`,
      );
    }
  }
  blockers.push(...input.workItems
    .filter((item) => item.kind === 'canonical' && item.status !== 'done')
    .map((item) => `canonical ${item.id} is ${item.status} (owner ${item.owner ?? 'unassigned'})`));
  const invalidCompletionJobs: string[] = [];
  const completionJobIds = [...new Set((input.completionJobs ?? []).flatMap((job) => {
      if (job.id.trim().length === 0) {
        invalidCompletionJobs.push('completion job id is blank');
        return [];
      }
      if (job.missionId.trim().length === 0) {
        invalidCompletionJobs.push(`completion job ${job.id} has a blank mission id`);
        return [];
      }
      if (job.missionId !== input.missionId) {
        invalidCompletionJobs.push(
          `completion job ${job.id} belongs to mission ${job.missionId}, not ${input.missionId}`,
        );
        return [];
      }
      return [job.id];
    }))].sort();
  blockers.push(...invalidCompletionJobs);
  if (completionJobIds.length === 0) blockers.push('mission-scoped completion jobs are missing');
  if (input.scopedIssues.length === 0) blockers.push('no scoped issues were supplied');
  const scopedIssueCounts = new Map<number, number>();
  for (const issue of input.scopedIssues) {
    if (!Number.isSafeInteger(issue.issue) || issue.issue < 1) {
      blockers.push(`scoped issue number ${issue.issue} is invalid`);
    }
    scopedIssueCounts.set(issue.issue, (scopedIssueCounts.get(issue.issue) ?? 0) + 1);
  }
  for (const [issue, count] of scopedIssueCounts) {
    if (count > 1) blockers.push(`scoped issue #${issue} is duplicated`);
  }
  for (const issue of input.scopedIssues) {
    if (!hasText(issue.canonicalWorkItemId)) blockers.push(`issue #${issue.issue} is missing a canonical work item binding`);
    else {
      const canonical = input.workItems.find((item) => (
        item.id === issue.canonicalWorkItemId && item.kind === 'canonical'
      ));
      if (!canonical) blockers.push(
        `issue #${issue.issue} canonical work item ${issue.canonicalWorkItemId} does not exist`,
      );
      else if (canonical.status !== 'done') blockers.push(
        `issue #${issue.issue} canonical work item ${issue.canonicalWorkItemId} is not done`,
      );
    }
    if (issue.implementationState !== 'implemented') blockers.push(`issue #${issue.issue} implementation is pending`);
    if (!hasText(issue.reviewedHead)) blockers.push(`issue #${issue.issue} is missing an exact reviewed head`);
    else if (!isGitOid(issue.reviewedHead)) blockers.push(`issue #${issue.issue} reviewed head is not a full Git object id`);
    if (!hasText(issue.mergeSha)) blockers.push(`issue #${issue.issue} is missing a merge SHA`);
    else if (!isGitOid(issue.mergeSha)) blockers.push(`issue #${issue.issue} merge SHA is not a full Git object id`);
    if (hasText(issue.mergeSha) && !hasText(issue.mergedReviewedHead)) {
      blockers.push(`issue #${issue.issue} merge evidence is missing its reviewed head`);
    } else if (issue.mergedReviewedHead && issue.mergedReviewedHead !== issue.reviewedHead) {
      blockers.push(
        `issue #${issue.issue} merge evidence reviewed head ${issue.mergedReviewedHead} does not match ${issue.reviewedHead}`,
      );
    }
  }
  if (input.deployment.state !== 'deployed') blockers.push('final reviewed main has not been deployed');
  if (!hasText(input.deployment.reviewedMainSha)) blockers.push('reviewed main SHA is missing');
  else if (!isGitOid(input.deployment.reviewedMainSha)) blockers.push('reviewed main SHA is not a full Git object id');
  if (!hasText(input.deployment.deployedSha)) blockers.push('deployed SHA is missing');
  else if (!isGitOid(input.deployment.deployedSha)) blockers.push('deployed SHA is not a full Git object id');
  for (const issue of input.scopedIssues) {
    if (hasText(issue.mergeSha) && !input.deployment.includedMergeShas.includes(issue.mergeSha)) {
      blockers.push(
        `reviewed main SHA ${input.deployment.reviewedMainSha ?? 'missing'} does not include scoped merge SHA ${issue.mergeSha} for issue #${issue.issue}`,
      );
    }
  }
  if (
    input.deployment.reviewedMainSha
    && input.deployment.deployedSha
    && input.deployment.deployedSha !== input.deployment.reviewedMainSha
  ) {
    blockers.push(
      `deployed SHA ${input.deployment.deployedSha} does not match reviewed main SHA ${input.deployment.reviewedMainSha}`,
    );
  }
  if (input.deployment.endpointChecks.length === 0) blockers.push('deployment endpoint checks are missing');
  for (const check of input.deployment.endpointChecks) {
    if (!hasText(check.endpoint)) blockers.push('deployment endpoint id is blank');
    if (check.status !== 'passed') blockers.push(`endpoint check ${check.endpoint} failed`);
    if (!hasText(check.deployedSha) || check.deployedSha !== input.deployment.deployedSha) blockers.push(
      `endpoint check ${check.endpoint} targets ${check.deployedSha ?? 'missing'}, not deployed SHA ${input.deployment.deployedSha ?? 'missing'}`,
    );
  }
  if (!input.deployment.verifiedAt) blockers.push('deployment verification timestamp is missing');
  else if (checkedAtMs - deploymentVerifiedAtMs > input.evidenceMaxAgeMs) {
    blockers.push('deployment verification timestamp is stale');
  }
  for (const check of input.deployment.endpointChecks) {
    const timestampMs = explicitTimestampMs(check.checkedAt);
    if (checkedAtMs - timestampMs > input.evidenceMaxAgeMs) {
      blockers.push(`endpoint check ${check.endpoint} timestamp is stale`);
    }
  }
  if (!input.acceptance.issue3815Passed) blockers.push('#3815 live E2E acceptance has not passed');
  if (!input.acceptance.authenticatedPublicRealDataPassed) {
    blockers.push('authenticated public real-data acceptance has not passed');
  }
  if (!hasText(input.acceptance.evidenceId)) blockers.push('browser evidence id is missing');
  if (!hasText(input.acceptance.deployedSha) || input.acceptance.deployedSha !== input.deployment.deployedSha) {
    blockers.push('acceptance deployed SHA is missing or does not match the deployment');
  }
  if (!input.acceptance.verifiedAt) blockers.push('acceptance verification timestamp is missing');
  else if (checkedAtMs - acceptanceVerifiedAtMs > input.evidenceMaxAgeMs) {
    blockers.push('acceptance verification timestamp is stale');
  }
  if (!Number.isFinite(checkedAtMs)) blockers.push('mission checkedAt timestamp is invalid');
  if (!Number.isFinite(input.evidenceMaxAgeMs) || input.evidenceMaxAgeMs <= 0) {
    blockers.push('evidence freshness window must be a positive finite duration');
  }
  if (input.deployment.verifiedAt && !Number.isFinite(deploymentVerifiedAtMs)) {
    blockers.push('deployment verification timestamp is invalid');
  } else if (Number.isFinite(checkedAtMs) && deploymentVerifiedAtMs > checkedAtMs) {
    blockers.push('deployment verification timestamp is in the future');
  }
  for (const check of input.deployment.endpointChecks) {
    const timestampMs = explicitTimestampMs(check.checkedAt);
    if (!Number.isFinite(timestampMs)) {
      blockers.push(`endpoint check ${check.endpoint} timestamp is invalid`);
    } else if (Number.isFinite(checkedAtMs) && timestampMs > checkedAtMs) {
      blockers.push(`endpoint check ${check.endpoint} timestamp is in the future`);
    } else if (Number.isFinite(deploymentVerifiedAtMs) && timestampMs > deploymentVerifiedAtMs) {
      blockers.push(`endpoint check ${check.endpoint} occurs after deployment verification`);
    }
  }
  if (input.acceptance.verifiedAt && !Number.isFinite(acceptanceVerifiedAtMs)) {
    blockers.push('acceptance verification timestamp is invalid');
  } else if (Number.isFinite(checkedAtMs) && acceptanceVerifiedAtMs > checkedAtMs) {
    blockers.push('acceptance verification timestamp is in the future');
  } else if (
    input.acceptance.verifiedAt
    && Number.isFinite(deploymentVerifiedAtMs)
    && acceptanceVerifiedAtMs < deploymentVerifiedAtMs
  ) {
    blockers.push('acceptance verification predates deployment verification');
  }
  blockers.push(...input.alerts.map((alert) => `alert: ${alert}`));
  const externalGates = [...input.externalGates].sort((left, right) => left.id.localeCompare(right.id));
  const requiredExternalGateIds = [...new Set(input.requiredExternalGateIds)].sort();
  const gateScopeMatches = (gate: MissionExternalGate): boolean => {
    const scope = gate.scope;
    if (!scope || !gate.head) return false;
    if (scope.kind === 'deployed-sha') return gate.head === input.deployment.deployedSha;
    return gate.head === input.scopedIssues.find((issue) => issue.issue === scope.issue)?.reviewedHead;
  };
  if (externalGates.length === 0) blockers.push('scheduled and external gate evidence is missing');
  if (requiredExternalGateIds.length === 0) blockers.push('required external gate inventory is missing');
  const externalGateIdCounts = new Map<string, number>();
  for (const gate of externalGates) {
    if (hasText(gate.id)) {
      externalGateIdCounts.set(gate.id, (externalGateIdCounts.get(gate.id) ?? 0) + 1);
    }
  }
  for (const [id, count] of externalGateIdCounts) {
    if (count > 1) blockers.push(`external gate id ${id} is duplicated`);
  }
  for (const id of requiredExternalGateIds) {
    if (!hasText(id)) blockers.push('required external gate id is blank');
    else if (!externalGateIdCounts.has(id)) blockers.push(`required external gate ${id} is missing`);
  }
  for (const gate of externalGates) {
    if (!hasText(gate.id)) blockers.push('external gate id is blank');
    if (
      gate.state === 'passed'
      && hasText(gate.owner)
      && hasText(gate.head)
      && hasText(gate.trigger)
      && hasText(gate.nextTransition)
      && gateScopeMatches(gate)
    ) continue;
    const missing = [
      !hasText(gate.owner) ? 'owner' : null,
      !hasText(gate.head) ? 'head' : null,
      !hasText(gate.trigger) ? 'trigger' : null,
      !hasText(gate.nextTransition) ? 'next transition' : null,
    ].filter((field): field is string => field !== null);
    const missingDetail = missing.length > 0 ? `; ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing` : '';
    blockers.push(
      `external gate ${gate.id} is ${gate.state}${missingDetail} (owner ${gate.owner ?? 'unassigned'}; head ${gate.head ?? 'unknown'}; trigger ${gate.trigger ?? 'unknown'})`,
    );
    if (!gate.scope) blockers.push(`external gate ${gate.id} is missing an evidence scope`);
    else if (gate.head && !gateScopeMatches(gate)) {
      if (gate.scope.kind === 'deployed-sha') {
        blockers.push(
          `external gate ${gate.id} head ${gate.head} does not match deployed SHA ${input.deployment.deployedSha ?? 'missing'}`,
        );
      } else {
        const scope = gate.scope;
        const reviewedHead = input.scopedIssues.find((issue) => issue.issue === scope.issue)?.reviewedHead;
        blockers.push(
          `external gate ${gate.id} head ${gate.head} does not match reviewed head ${reviewedHead ?? 'missing'} for issue #${gate.scope.issue}`,
        );
      }
    }
  }
  const externalGatesPassed = requiredExternalGateIds.length > 0
    && requiredExternalGateIds.every((id) => externalGateIdCounts.has(id))
    && input.externalGates.length > 0 && input.externalGates.every((gate) => (
    gate.state === 'passed'
    && hasText(gate.id)
    && hasText(gate.owner)
    && hasText(gate.head)
    && hasText(gate.trigger)
    && hasText(gate.nextTransition)
    && gateScopeMatches(gate)
  ));
  const ownership = input.workItems
    .filter((item) => item.kind === 'canonical')
    .map((canonical) => ({
      canonicalId: canonical.id,
      canonicalOwner: canonical.owner,
      canonicalStatus: canonical.status,
      linked: input.workItems
        .filter((item) => item.kind !== 'canonical' && item.linkedCanonicalId === canonical.id)
        .map((item) => ({
          id: item.id,
          kind: item.kind as Exclude<MissionWorkItem['kind'], 'canonical'>,
          owner: item.owner,
          status: item.status,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  const issueEvidence = [...input.scopedIssues].sort((left, right) => left.issue - right.issue);
  const reviewedHeads = Object.fromEntries(issueEvidence.flatMap((issue) => (
    issue.reviewedHead ? [[String(issue.issue), issue.reviewedHead]] : []
  )));
  const mergeShas = Object.fromEntries(issueEvidence.flatMap((issue) => (
    issue.mergeSha ? [[String(issue.issue), issue.mergeSha]] : []
  )));
  const endpointChecks = [...input.deployment.endpointChecks].sort((left, right) => (
    left.endpoint.localeCompare(right.endpoint) || left.checkedAt.localeCompare(right.checkedAt)
  ));
  blockers.sort((left, right) => left.localeCompare(right));
  const terminal = implementation
    && reviewed
    && merged
    && deployed
    && accepted
    && input.alerts.length === 0
    && blockers.length === 0
    && externalGatesPassed
    && completionJobIds.length > 0;

  return {
    missionId: input.missionId,
    checkedAt: input.checkedAt,
    evidenceMaxAgeMs: input.evidenceMaxAgeMs,
    health: input.alerts.length === 0 ? 'healthy-progression' : 'attention-required',
    terminal,
    shouldStopJobs: terminal,
    jobsToStop: terminal ? completionJobIds : [],
    stages: {
      implementation: implementation ? 'passed' : 'pending',
      reviewed: reviewed ? 'passed' : 'pending',
      merged: merged ? 'passed' : 'pending',
      deployed: deployed ? 'passed' : 'pending',
      realDataAccepted: accepted ? 'passed' : 'pending',
      completion: terminal ? 'passed' : 'pending',
    },
    summary: terminal
      ? `Mission complete at deployed SHA ${input.deployment.deployedSha}.`
      : `${input.alerts.length} alerts; mission remains in progress.`,
    blockers,
    evidence: {
      reviewedHeads,
      mergeShas,
      deployedSha: input.deployment.deployedSha,
      endpointChecks,
      browserEvidenceId: input.acceptance.evidenceId,
    },
    externalGates,
    ownership,
    stopOnceKey: terminal
      ? `mission-stop:v1:${createHash('sha256').update(JSON.stringify({
        version: 1,
        missionId: input.missionId,
        deployedSha: input.deployment.deployedSha,
        browserEvidenceId: input.acceptance.evidenceId,
        jobsToStop: completionJobIds,
      })).digest('hex')}`
      : null,
  };
}

function escapeStatusField(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u206f]/g, (character) => (
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    ));
}

export function renderMissionCompletionStatus(result: MissionCompletionResult): string {
  const field = (value: string | null, fallback: string): string => (
    escapeStatusField(value ?? fallback)
  );
  const lines = [
    `MISSION ${field(result.missionId, 'unknown')} · ${result.health.replace('-', ' ').toUpperCase()} · ${result.terminal ? 'COMPLETE' : 'IN PROGRESS'}`,
    `CHECKED ${field(result.checkedAt, 'unknown')}`,
    `STAGES implementation=${result.stages.implementation} reviewed=${result.stages.reviewed} merged=${result.stages.merged} deployed=${result.stages.deployed} real-data=${result.stages.realDataAccepted} completion=${result.stages.completion}`,
  ];

  for (const owner of result.ownership) {
    const linked = owner.linked.map((item) => (
      `${item.kind} ${field(item.id, 'unknown')} [${item.status}] owner=${field(item.owner, 'unassigned')}`
    ));
    lines.push(
      `OWNERSHIP ${field(owner.canonicalId, 'unknown')} [${owner.canonicalStatus}] owner=${field(owner.canonicalOwner, 'unassigned')}${linked.length > 0 ? ` -> ${linked.join(' -> ')}` : ''}`,
    );
  }

  for (const gate of result.externalGates) {
    lines.push(
      `GATE ${field(gate.id, 'unknown')} [${gate.state}] owner=${field(gate.owner, 'unassigned')} head=${field(gate.head, 'unknown')} trigger=${field(gate.trigger, 'unknown')} next=${field(gate.nextTransition, 'unknown')}`,
    );
  }

  const endpoints = result.evidence.endpointChecks
    .map((check) => `${field(check.endpoint, 'unknown')}:${check.status}@${field(check.checkedAt, 'unknown')}`)
    .join(',');
  lines.push(
    `EVIDENCE reviewed=${escapeStatusField(JSON.stringify(result.evidence.reviewedHeads))} merges=${escapeStatusField(JSON.stringify(result.evidence.mergeShas))} deployed=${field(result.evidence.deployedSha, 'missing')} endpoints=${endpoints || 'missing'} browser=${field(result.evidence.browserEvidenceId, 'missing')}`,
  );
  lines.push(...result.blockers.map((blocker) => `BLOCKER ${escapeStatusField(blocker)}`));
  lines.push(result.shouldStopJobs
    ? `STOP jobs=${result.jobsToStop.map(escapeStatusField).join(',')} once=${field(result.stopOnceKey, 'missing')}`
    : 'STOP completion jobs remain active');
  return lines.join('\n');
}
