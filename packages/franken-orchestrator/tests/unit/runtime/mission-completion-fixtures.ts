import type { MissionCompletionInput } from '../../../src/runtime/index.js';

export function incompleteMission(): MissionCompletionInput {
  return {
    missionId: 'smart-swarm-runtime',
    checkedAt: '2026-07-28T03:00:00.000Z',
    evidenceMaxAgeMs: 300_000,
    completionJobs: [
      { id: 'controller-job', missionId: 'smart-swarm-runtime' },
      { id: 'liveness-job', missionId: 'smart-swarm-runtime' },
      { id: 'hourly-job', missionId: 'smart-swarm-runtime' },
    ],
    alerts: [],
    scopedIssues: [{
      issue: 3812,
      canonicalWorkItemId: 'canonical-3812',
      implementationState: 'implemented',
      reviewedHead: '1111111111111111111111111111111111111111',
      mergeSha: null,
    }],
    workItems: [{
      id: 'canonical-3812',
      kind: 'canonical',
      status: 'done',
      owner: 'worker-a',
      linkedCanonicalId: null,
    }],
    requiredExternalGateIds: ['public-acceptance'],
    externalGates: [],
    deployment: {
      state: 'pending',
      reviewedMainSha: null,
      deployedSha: null,
      includedMergeShas: [],
      endpointChecks: [],
      verifiedAt: null,
    },
    acceptance: {
      issue3815Passed: false,
      authenticatedPublicRealDataPassed: false,
      deployedSha: null,
      evidenceId: null,
      verifiedAt: null,
    },
  };
}

export function otherwiseCompleteMission(): MissionCompletionInput {
  const mission = incompleteMission();
  return {
    ...mission,
    scopedIssues: mission.scopedIssues.map((issue) => ({
      ...issue,
      mergeSha: '2222222222222222222222222222222222222222',
      mergedReviewedHead: issue.reviewedHead,
    })),
    deployment: {
      state: 'deployed',
      reviewedMainSha: '3333333333333333333333333333333333333333',
      deployedSha: '3333333333333333333333333333333333333333',
      includedMergeShas: ['2222222222222222222222222222222222222222'],
      endpointChecks: [{
        endpoint: 'https://dashboard.example.test/health',
        status: 'passed',
        checkedAt: mission.checkedAt,
        deployedSha: '3333333333333333333333333333333333333333',
      }],
      verifiedAt: mission.checkedAt,
    },
    acceptance: {
      issue3815Passed: true,
      authenticatedPublicRealDataPassed: true,
      deployedSha: '3333333333333333333333333333333333333333',
      evidenceId: 'browser-evidence-1',
      verifiedAt: mission.checkedAt,
    },
  };
}
