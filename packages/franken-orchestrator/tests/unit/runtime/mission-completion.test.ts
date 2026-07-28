import { describe, expect, it } from 'vitest';
import {
  evaluateMissionCompletion,
  renderMissionCompletionStatus,
  type MissionCompletionInput,
} from '../../../src/runtime/index.js';
import { incompleteMission, otherwiseCompleteMission } from './mission-completion-fixtures.js';

describe('smart-swarm mission completion', () => {
  it('reports zero alerts as healthy progression without claiming completion', () => {
    const result = evaluateMissionCompletion(incompleteMission());

    expect(result).toMatchObject({
      health: 'healthy-progression',
      terminal: false,
      shouldStopJobs: false,
      stages: {
        implementation: 'passed',
        reviewed: 'passed',
        merged: 'pending',
        deployed: 'pending',
        realDataAccepted: 'pending',
        completion: 'pending',
      },
    });
    expect(result.summary).toContain('0 alerts');
    expect(result.summary).not.toMatch(/mission complete/i);
  });

  it('rejects blank and foreign completion jobs instead of stopping arbitrary jobs', () => {
    const mission = otherwiseCompleteMission() as MissionCompletionInput & {
      completionJobs: Array<{ id: string; missionId: string }>;
    };
    mission.externalGates = [{
      id: 'public-acceptance',
      state: 'passed',
      owner: 'acceptance-worker',
      head: 'main-sha',
      trigger: 'deployment verified',
      nextTransition: 'terminalize mission',
    }];
    mission.completionJobs = [
      { id: 'owned-job', missionId: mission.missionId },
      { id: '', missionId: mission.missionId },
      { id: 'foreign-job', missionId: 'another-mission' },
    ];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.jobsToStop).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'completion job id is blank',
      'completion job foreign-job belongs to mission another-mission, not smart-swarm-runtime',
    ]));
  });

  it('rejects legacy unscoped completion job ids', () => {
    const mission = otherwiseCompleteMission() as unknown as MissionCompletionInput & {
      completionJobs?: undefined;
      completionJobIds: string[];
    };
    mission.externalGates = [{
      id: 'public-acceptance',
      state: 'passed',
      owner: 'acceptance-worker',
      head: 'main-sha',
      trigger: 'deployment verified',
      nextTransition: 'terminalize mission',
    }];
    delete mission.completionJobs;
    mission.completionJobIds = ['arbitrary-job'];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.jobsToStop).toEqual([]);
    expect(result.blockers).toContain('mission-scoped completion jobs are missing');
  });

  it('treats whitespace-only identities and evidence as missing', () => {
    const mission = otherwiseCompleteMission();
    mission.scopedIssues[0] = {
      ...mission.scopedIssues[0]!,
      canonicalWorkItemId: '   ',
      reviewedHead: '   ',
      mergeSha: '   ',
      mergedReviewedHead: '   ',
    };
    mission.workItems[0] = { ...mission.workItems[0]!, id: '   ' };
    mission.deployment.reviewedMainSha = '   ';
    mission.deployment.deployedSha = '   ';
    mission.deployment.endpointChecks[0] = {
      ...mission.deployment.endpointChecks[0]!, endpoint: '   ', deployedSha: '   ',
    };
    mission.acceptance.deployedSha = '   ';
    mission.acceptance.evidenceId = '   ';
    mission.externalGates = [{
      id: '   ', state: 'passed', owner: '   ', head: '   ', trigger: '   ', nextTransition: '   ',
      scope: { kind: 'deployed-sha' },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'issue #3812 is missing a canonical work item binding',
      'issue #3812 is missing an exact reviewed head',
      'issue #3812 is missing a merge SHA',
      'work item id is blank',
      'reviewed main SHA is missing',
      'deployed SHA is missing',
      'deployment endpoint id is blank',
      'browser evidence id is missing',
      'external gate id is blank',
    ]));
  });

  it('fails closed when work item ids are duplicated', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems.push({
      id: 'canonical-3812',
      kind: 'recovery',
      status: 'done',
      owner: 'worker-b',
      linkedCanonicalId: 'canonical-3812',
    });
    mission.externalGates = [{
      id: 'deployment-gate', state: 'passed', owner: 'owner', head: 'main-sha',
      trigger: 'deployed', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain('work item id canonical-3812 is duplicated');
  });

  it('fails closed when linked work references a missing canonical item', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems.push({
      id: 'orphaned-recovery',
      kind: 'recovery',
      status: 'done',
      owner: 'worker-b',
      linkedCanonicalId: 'missing-canonical',
    });
    mission.externalGates = [{
      id: 'deployment-gate', state: 'passed', owner: 'owner', head: 'main-sha',
      trigger: 'deployed', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain(
      'recovery orphaned-recovery references missing canonical work item missing-canonical',
    );
  });

  it('fails closed when linked work omits its canonical item link', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems.push({
      id: 'unlinked-recovery',
      kind: 'recovery',
      status: 'done',
      owner: 'worker-b',
      linkedCanonicalId: null,
    });
    mission.externalGates = [{
      id: 'deployment-gate', state: 'passed', owner: 'owner', head: 'main-sha',
      trigger: 'deployed', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain('recovery unlinked-recovery is missing a canonical work item link');
  });

  it('fails closed when scoped issue numbers are duplicated', () => {
    const mission = otherwiseCompleteMission();
    mission.scopedIssues.push({
      ...mission.scopedIssues[0]!,
      reviewedHead: 'conflicting-reviewed-head',
      mergeSha: 'conflicting-merge-sha',
      mergedReviewedHead: 'conflicting-reviewed-head',
    });
    mission.externalGates = [{
      id: 'issue-review-gate', state: 'passed', owner: 'reviewer', head: 'reviewed-head-3812',
      trigger: 'review completed', nextTransition: 'merge',
      scope: { kind: 'issue-reviewed-head', issue: 3812 },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain('scoped issue #3812 is duplicated');
  });

  it('rejects scoped issue numbers that are not positive safe integers', () => {
    const mission = otherwiseCompleteMission();
    mission.scopedIssues[0]!.issue = 3812.5;

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain('scoped issue number 3812.5 is invalid');
  });

  it('requires every scoped issue to bind to a done canonical work item', () => {
    const mission = otherwiseCompleteMission();
    delete mission.scopedIssues[0]!.canonicalWorkItemId;
    mission.externalGates = [{
      id: 'public-acceptance', state: 'passed', owner: 'acceptance-worker', head: 'main-sha',
      trigger: 'deployment verified', nextTransition: 'terminalize mission',
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain('issue #3812 is missing a canonical work item binding');
  });

  it('does not treat archived canonical or linked work as done', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems[0] = { ...mission.workItems[0]!, status: 'archived' };
    mission.workItems.push({
      id: 'archived-recovery', kind: 'recovery', status: 'archived', owner: 'worker-b',
      linkedCanonicalId: 'canonical-3812',
    });
    mission.externalGates = [{
      id: 'public-acceptance', state: 'passed', owner: 'acceptance-worker', head: 'main-sha',
      trigger: 'deployment verified', nextTransition: 'terminalize mission',
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'canonical canonical-3812 is archived (owner worker-a)',
      'recovery archived-recovery is archived (owner worker-b; canonical canonical-3812)',
      'issue #3812 canonical work item canonical-3812 is not done',
    ]));
  });

  it('keeps a done canonical card nonterminal while a linked successor is open', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems.push({
      id: 'recovery-3812',
      kind: 'successor',
      status: 'running',
      owner: 'worker-b',
      linkedCanonicalId: 'canonical-3812',
    });

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.shouldStopJobs).toBe(false);
    expect(result.stages.completion).toBe('pending');
    expect(result.blockers).toContain('successor recovery-3812 is running (owner worker-b; canonical canonical-3812)');
    expect(result.ownership).toEqual([
      {
        canonicalId: 'canonical-3812',
        canonicalOwner: 'worker-a',
        canonicalStatus: 'done',
        linked: [{ id: 'recovery-3812', kind: 'successor', owner: 'worker-b', status: 'running' }],
      },
    ]);
  });

  it('keeps the mission nonterminal while a canonical work item is still active', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems[0] = { ...mission.workItems[0]!, status: 'running' };
    mission.externalGates = [{
      id: 'review-gate',
      state: 'passed',
      owner: 'reviewer',
      head: 'reviewed-head-3812',
      trigger: 'review completed',
      nextTransition: 'merge',
      scope: { kind: 'issue-reviewed-head', issue: 3812 },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'canonical canonical-3812 is running (owner worker-a)',
      'issue #3812 canonical work item canonical-3812 is not done',
    ]));
  });

  it('requires merge evidence to record the exact reviewed head', () => {
    const mission = otherwiseCompleteMission() as MissionCompletionInput & {
      scopedIssues: Array<MissionCompletionInput['scopedIssues'][number] & { mergedReviewedHead: string }>;
    };
    mission.scopedIssues[0]!.mergedReviewedHead = 'different-head';
    mission.externalGates = [{
      id: 'public-acceptance', state: 'passed', owner: 'acceptance-worker', head: 'main-sha',
      trigger: 'deployment verified', nextTransition: 'terminalize mission',
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.stages.merged).toBe('pending');
    expect(result.blockers).toContain(
      'issue #3812 merge evidence reviewed head different-head does not match reviewed-head-3812',
    );
  });

  it('requires reviewed main to include every scoped merge', () => {
    const mission = otherwiseCompleteMission() as MissionCompletionInput & {
      deployment: MissionCompletionInput['deployment'] & { includedMergeShas: string[] };
    };
    mission.deployment.includedMergeShas = [];
    mission.externalGates = [{
      id: 'deployment-gate', state: 'passed', owner: 'deployer', head: 'main-sha',
      trigger: 'deployed', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.stages.deployed).toBe('pending');
    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain(
      'reviewed main SHA main-sha does not include scoped merge SHA merge-sha-3812 for issue #3812',
    );
  });

  it('binds each passed external gate head to its typed evidence scope', () => {
    const mission = otherwiseCompleteMission();
    mission.externalGates = [{
      id: 'issue-review-gate', state: 'passed', owner: 'reviewer', head: 'main-sha',
      trigger: 'review completed', nextTransition: 'merge',
      scope: { kind: 'issue-reviewed-head', issue: 3812 },
    }] as MissionCompletionInput['externalGates'];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain(
      'external gate issue-review-gate head main-sha does not match reviewed head reviewed-head-3812 for issue #3812',
    );
  });

  it('fails closed when external gate ids are duplicated', () => {
    const mission = otherwiseCompleteMission();
    mission.externalGates = [
      {
        id: 'deployment-gate', state: 'passed', owner: 'deployer', head: 'main-sha',
        trigger: 'deployed', nextTransition: 'acceptance', scope: { kind: 'deployed-sha' },
      },
      {
        id: 'deployment-gate', state: 'passed', owner: 'acceptance-worker', head: 'main-sha',
        trigger: 'accepted', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
      },
    ];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toContain('external gate id deployment-gate is duplicated');
  });

  it('binds endpoint checks to the deployed SHA', () => {
    const mission = otherwiseCompleteMission() as MissionCompletionInput & {
      deployment: MissionCompletionInput['deployment'] & {
        endpointChecks: Array<MissionCompletionInput['deployment']['endpointChecks'][number] & { deployedSha: string }>;
      };
    };
    mission.deployment.endpointChecks[0]!.deployedSha = 'other-sha';

    const result = evaluateMissionCompletion(mission);

    expect(result.stages.deployed).toBe('pending');
    expect(result.blockers).toContain(
      'endpoint check https://dashboard.example.test/health targets other-sha, not deployed SHA main-sha',
    );
  });

  it('keeps real-data acceptance pending until deployment validation passes', () => {
    const mission = otherwiseCompleteMission();
    mission.deployment.endpointChecks[0] = {
      ...mission.deployment.endpointChecks[0]!,
      status: 'failed',
    };

    const result = evaluateMissionCompletion(mission);

    expect(result.stages.deployed).toBe('pending');
    expect(result.stages.realDataAccepted).toBe('pending');
  });

  it('rejects stale evidence using the configured freshness window', () => {
    const mission = otherwiseCompleteMission();
    mission.checkedAt = '2026-07-28T04:00:00.000Z';
    mission.evidenceMaxAgeMs = 30 * 60 * 1000;

    const result = evaluateMissionCompletion(mission);

    expect(result.stages.deployed).toBe('pending');
    expect(result.stages.realDataAccepted).toBe('pending');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'deployment verification timestamp is stale',
      'acceptance verification timestamp is stale',
      'endpoint check https://dashboard.example.test/health timestamp is stale',
    ]));
  });

  it('fails closed with actionable blockers for malformed timestamps and freshness config', () => {
    const mission = otherwiseCompleteMission();
    mission.checkedAt = 'not-a-timestamp';
    mission.evidenceMaxAgeMs = 0;
    mission.deployment.verifiedAt = 'invalid-deployment-time';
    mission.deployment.endpointChecks[0]!.checkedAt = 'invalid-endpoint-time';
    mission.acceptance.verifiedAt = 'invalid-acceptance-time';

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'mission checkedAt timestamp is invalid',
      'evidence freshness window must be a positive finite duration',
      'deployment verification timestamp is invalid',
      'endpoint check https://dashboard.example.test/health timestamp is invalid',
      'acceptance verification timestamp is invalid',
    ]));
  });

  it('rejects evidence timestamps without an explicit timezone', () => {
    const mission = otherwiseCompleteMission();
    mission.checkedAt = '2026-07-28T03:00:00';
    mission.deployment.verifiedAt = '2026-07-28T02:55:00';
    mission.deployment.endpointChecks[0]!.checkedAt = '2026-07-28T02:56:00';
    mission.acceptance.verifiedAt = '2026-07-28T02:57:00';

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'mission checkedAt timestamp is invalid',
      'deployment verification timestamp is invalid',
      'endpoint check https://dashboard.example.test/health timestamp is invalid',
      'acceptance verification timestamp is invalid',
    ]));
  });

  it('rejects impossible calendar timestamps instead of normalizing them', () => {
    const mission = otherwiseCompleteMission();
    mission.checkedAt = '2026-02-30T03:00:00.000Z';
    mission.deployment.verifiedAt = '2026-02-30T02:55:00.000Z';
    mission.deployment.endpointChecks[0]!.checkedAt = '2026-02-30T02:56:00.000Z';
    mission.acceptance.verifiedAt = '2026-02-30T02:57:00.000Z';

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'mission checkedAt timestamp is invalid',
      'deployment verification timestamp is invalid',
      'endpoint check https://dashboard.example.test/health timestamp is invalid',
      'acceptance verification timestamp is invalid',
    ]));
  });

  it('accepts lowercase UTC designators in otherwise valid evidence', () => {
    const mission = otherwiseCompleteMission();
    mission.checkedAt = mission.checkedAt.replace(/Z$/u, 'z');
    mission.deployment.verifiedAt = mission.deployment.verifiedAt!.replace(/Z$/u, 'z');
    mission.deployment.endpointChecks[0]!.checkedAt = mission.deployment.endpointChecks[0]!.checkedAt.replace(/Z$/u, 'z');
    mission.acceptance.verifiedAt = mission.acceptance.verifiedAt!.replace(/Z$/u, 'z');
    mission.externalGates = [{
      id: 'public-acceptance', state: 'passed', owner: 'acceptance-worker', head: 'main-sha',
      trigger: 'deployment verified', nextTransition: 'terminalize mission', scope: { kind: 'deployed-sha' },
    }];

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(true);
  });

  it('requires endpoint and acceptance evidence to follow deployment in causal order', () => {
    const mission = otherwiseCompleteMission();
    mission.checkedAt = '2026-07-28T03:02:00.000Z';
    mission.deployment.verifiedAt = '2026-07-28T03:00:00.000Z';
    mission.deployment.endpointChecks[0]!.checkedAt = '2026-07-28T03:01:00.000Z';
    mission.acceptance.verifiedAt = '2026-07-28T02:59:00.000Z';

    const result = evaluateMissionCompletion(mission);

    expect(result.stages.deployed).toBe('pending');
    expect(result.stages.realDataAccepted).toBe('pending');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'endpoint check https://dashboard.example.test/health occurs after deployment verification',
      'acceptance verification predates deployment verification',
    ]));
  });

  it('rejects evidence timestamps that are later than the mission check', () => {
    const mission = otherwiseCompleteMission();
    const future = '2026-07-28T03:01:00.000Z';
    mission.deployment.verifiedAt = future;
    mission.deployment.endpointChecks[0]!.checkedAt = future;
    mission.acceptance.verifiedAt = future;

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'deployment verification timestamp is in the future',
      'endpoint check https://dashboard.example.test/health timestamp is in the future',
      'acceptance verification timestamp is in the future',
    ]));
  });

  it('keeps scheduled gates actionable with exact ownership and transition evidence', () => {
    const mission = otherwiseCompleteMission();
    mission.externalGates.push({
      id: 'deployment-controller',
      state: 'pending',
      owner: 'scheduled-controller',
      head: 'main-sha',
      trigger: 'after #3857 merges',
      nextTransition: null,
    });

    const result = evaluateMissionCompletion(mission);

    expect(result.terminal).toBe(false);
    expect(result.externalGates).toEqual(mission.externalGates);
    expect(result.blockers).toContain(
      'external gate deployment-controller is pending; next transition is missing (owner scheduled-controller; head main-sha; trigger after #3857 merges)',
    );
  });

  it('emits one deterministic terminal stop decision with durable evidence', () => {
    const mission = otherwiseCompleteMission();
    mission.externalGates.push({
      id: 'public-acceptance',
      state: 'passed',
      owner: 'acceptance-worker',
      head: 'main-sha',
      trigger: 'deployment verified',
      nextTransition: 'terminalize mission',
      scope: { kind: 'deployed-sha' },
    });

    const result = evaluateMissionCompletion(mission);

    expect(result).toMatchObject({
      missionId: 'smart-swarm-runtime',
      checkedAt: '2026-07-28T03:00:00.000Z',
      terminal: true,
      shouldStopJobs: true,
      jobsToStop: ['controller-job', 'hourly-job', 'liveness-job'],
      stopOnceKey: expect.stringMatching(/^mission-stop:v1:[0-9a-f]{64}$/),
      stages: {
        implementation: 'passed',
        reviewed: 'passed',
        merged: 'passed',
        deployed: 'passed',
        realDataAccepted: 'passed',
        completion: 'passed',
      },
      evidence: {
        reviewedHeads: { '3812': 'reviewed-head-3812' },
        mergeShas: { '3812': 'merge-sha-3812' },
        deployedSha: 'main-sha',
        endpointChecks: mission.deployment.endpointChecks,
        browserEvidenceId: 'browser-evidence-1',
      },
    });
    expect(result.summary).toBe('Mission complete at deployed SHA main-sha.');
  });

  it('enumerates missing merge, deployment, endpoint, and browser acceptance evidence', () => {
    const mission = incompleteMission();
    mission.scopedIssues[0] = {
      ...mission.scopedIssues[0],
      reviewedHead: null,
      mergeSha: null,
    };
    mission.deployment = {
      state: 'deployed',
      reviewedMainSha: 'main-sha',
      deployedSha: 'stale-sha',
      endpointChecks: [{
        endpoint: 'https://dashboard.example.test/health',
        status: 'failed',
        checkedAt: mission.checkedAt,
      }],
      verifiedAt: null,
    };

    const result = evaluateMissionCompletion(mission);

    expect(result.blockers).toEqual(expect.arrayContaining([
      'issue #3812 is missing an exact reviewed head',
      'issue #3812 is missing a merge SHA',
      'deployed SHA stale-sha does not match reviewed main SHA main-sha',
      'endpoint check https://dashboard.example.test/health failed',
      'deployment verification timestamp is missing',
      '#3815 live E2E acceptance has not passed',
      'authenticated public real-data acceptance has not passed',
      'browser evidence id is missing',
      'acceptance deployed SHA is missing or does not match the deployment',
      'acceptance verification timestamp is missing',
    ]));
    expect(result.shouldStopJobs).toBe(false);
  });

  it('fails closed when scheduled and external gate evidence is omitted', () => {
    const result = evaluateMissionCompletion(otherwiseCompleteMission());

    expect(result.terminal).toBe(false);
    expect(result.shouldStopJobs).toBe(false);
    expect(result.blockers).toContain('scheduled and external gate evidence is missing');
  });

  it('renders staged status with canonical, successor, and external-gate ownership', () => {
    const mission = otherwiseCompleteMission();
    mission.workItems.push({
      id: 'successor-3812',
      kind: 'successor',
      status: 'running',
      owner: 'worker-b',
      linkedCanonicalId: 'canonical-3812',
    });
    mission.externalGates = [{
      id: 'deployment-verifier',
      state: 'pending',
      owner: 'verifier',
      head: 'main-sha',
      trigger: 'deploy succeeds',
      nextTransition: 'run authenticated browser acceptance',
    }];

    const status = renderMissionCompletionStatus(evaluateMissionCompletion(mission));

    expect(status).toContain('MISSION smart-swarm-runtime · HEALTHY PROGRESSION · IN PROGRESS');
    expect(status).toContain('STAGES implementation=passed reviewed=passed merged=passed deployed=passed real-data=passed completion=pending');
    expect(status).toContain('OWNERSHIP canonical-3812 [done] owner=worker-a -> successor successor-3812 [running] owner=worker-b');
    expect(status).toContain('GATE deployment-verifier [pending] owner=verifier head=main-sha trigger=deploy succeeds next=run authenticated browser acceptance');
    expect(status).toContain('STOP completion jobs remain active');
  });

  it('escapes line-breaking control characters in operator-controlled status fields', () => {
    const mission = otherwiseCompleteMission();
    mission.externalGates = [{
      id: 'gate\nBLOCKER forged',
      state: 'pending',
      owner: 'owner\rSTOP forged',
      head: 'main-sha',
      trigger: 'trigger\u001b[31m\u0085forged\u009b31mCSI',
      nextTransition: 'next\u2028BLOCKER unicode\u2029STOP unicode\u202ereversed\u2066isolated\u2069',
      scope: { kind: 'deployed-sha' },
    }];

    const status = renderMissionCompletionStatus(evaluateMissionCompletion(mission));

    expect(status).not.toContain('\nBLOCKER forged');
    expect(status).not.toContain('\rSTOP forged');
    expect(status).not.toContain('\u001b');
    expect(status).not.toContain('\u0085');
    expect(status).not.toContain('\u009b');
    expect(status).not.toContain('\u2028');
    expect(status).not.toContain('\u2029');
    expect(status).not.toContain('\u202e');
    expect(status).not.toContain('\u2066');
    expect(status).not.toContain('\u2069');
    expect(status).toContain('gate\\nBLOCKER forged');
  });

  it('produces identical results when unordered evidence arrives in a different order', () => {
    const mission = otherwiseCompleteMission();
    mission.alerts = ['z-alert', 'a-alert'];
    mission.workItems.push(
      { id: 'z-successor', kind: 'successor', status: 'running', owner: 'z-owner', linkedCanonicalId: 'canonical-3812' },
      { id: 'a-recovery', kind: 'recovery', status: 'done', owner: 'a-owner', linkedCanonicalId: 'canonical-3812' },
    );
    mission.deployment.endpointChecks.push({
      endpoint: 'https://a.example.test/health',
      status: 'passed',
      checkedAt: mission.checkedAt,
      deployedSha: 'main-sha',
    });
    mission.externalGates = [{
      id: 'deployment-gate', state: 'passed', owner: 'owner', head: 'main-sha',
      trigger: 'deployed', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
    }];
    const reversed = structuredClone(mission);
    reversed.alerts.reverse();
    reversed.workItems.reverse();
    reversed.deployment.endpointChecks.reverse();
    reversed.completionJobs.reverse();

    expect(evaluateMissionCompletion(reversed)).toEqual(evaluateMissionCompletion(mission));
  });

  it('uses a collision-safe stop-once key bound to the exact shutdown job set', () => {
    const mission = otherwiseCompleteMission();
    mission.externalGates = [{
      id: 'deployment-gate', state: 'passed', owner: 'owner', head: 'main-sha',
      trigger: 'deployed', nextTransition: 'complete', scope: { kind: 'deployed-sha' },
    }];
    const expanded = structuredClone(mission);
    expanded.completionJobs.push({ id: 'extra-job', missionId: mission.missionId });

    const baseKey = evaluateMissionCompletion(mission).stopOnceKey;
    const expandedKey = evaluateMissionCompletion(expanded).stopOnceKey;

    expect(baseKey).toMatch(/^mission-stop:v1:[0-9a-f]{64}$/);
    expect(expandedKey).toMatch(/^mission-stop:v1:[0-9a-f]{64}$/);
    expect(expandedKey).not.toBe(baseKey);
  });
});
