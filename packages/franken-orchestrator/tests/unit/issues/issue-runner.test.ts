import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IssueRunner, evaluateIssueBackpressure, buildIssueSchedulerFairnessReport, routeIssueWorkerForDegradedMode, detectDuplicateWorkerCardProcesses, detectWorkerHeartbeatMonotonicityAnomalies, detectStuckRunWatchdogFindings, buildWorkerCrashOnlyRestartContract, evaluateIssueSchedulingScore, planKanbanStateMutation } from '../../../src/issues/issue-runner.js';
import type { IssueBackpressureSignals, IssueBackpressureThresholds, IssueRunnerConfig } from '../../../src/issues/issue-runner.js';
import type { GithubIssue, TriageResult } from '../../../src/issues/types.js';
import type { PlanGraph, ICheckpointStore, ILogger, BeastLoopDeps } from '../../../src/deps.js';
import type { IssueGraphBuilder } from '../../../src/issues/issue-graph-builder.js';
import type { GitBranchIsolator } from '../../../src/skills/git-branch-isolator.js';
import type { BeastResult } from '../../../src/types.js';
import type { IssueRuntimeArtifacts, IssueRuntimeSupport } from '../../../src/issues/issue-runner.js';
import type { ChunkDefinition } from '../../../src/cli/file-writer.js';

// ── Mocks ──

const mockLoopConstructions: Array<{ deps: BeastLoopDeps; config: unknown }> = [];
const tempPlanFiles: string[] = [];

const mockRun = vi.fn(async (deps?: BeastLoopDeps) => {
  // Default mock behavior: success with some tokens used
  const result = {
    status: 'completed',
    tokenSpend: { totalTokens: 200 },
    taskResults: [
      { taskId: 'impl:dummy', status: 'success' },
      { taskId: 'harden:dummy', status: 'success' },
    ],
  } as unknown as BeastResult;

  await deps?.prCreator?.create?.(result, undefined);
  return result;
});

interface BurstDispatchIssueFixture {
  readonly number: number;
  readonly title: string;
  readonly labels: readonly string[];
}

interface BurstDispatchLoadFixtureCase {
  readonly name: string;
  readonly thresholds?: IssueBackpressureThresholds;
  readonly signals: IssueBackpressureSignals;
  readonly expectedAllowed: boolean;
  readonly expectedReasons: readonly string[];
}

interface BurstDispatchLoadFixture {
  readonly description: string;
  readonly issues: readonly BurstDispatchIssueFixture[];
  readonly thresholds: IssueBackpressureThresholds;
  readonly snapshots: readonly BurstDispatchLoadFixtureCase[];
  readonly edgeCases: readonly BurstDispatchLoadFixtureCase[];
}

interface FlakyLivenessReplayRouteExpectation {
  readonly mode: 'normal' | 'degraded';
  readonly action: 'start-fresh' | 'resume-checkpointed' | 'complete-checkpointed' | 'defer-fresh-start';
  readonly reason?: string;
}

interface FlakyLivenessReplaySnapshot {
  readonly name: string;
  readonly checkpointHasIssueProgress: boolean;
  readonly graphHasCheckpointProgress: boolean;
  readonly stopRemainingReason?: string;
  readonly signals: IssueBackpressureSignals;
  readonly expectedAllowed: boolean;
  readonly expectedReasons: readonly string[];
  readonly expectedRoute: FlakyLivenessReplayRouteExpectation;
}

interface FlakyLivenessReplayFixture {
  readonly description: string;
  readonly issue: BurstDispatchIssueFixture;
  readonly thresholds: IssueBackpressureThresholds;
  readonly snapshots: readonly FlakyLivenessReplaySnapshot[];
  readonly edgeCases: readonly FlakyLivenessReplaySnapshot[];
}

interface LargeBacklogLivenessRefillFixture {
  readonly description: string;
  readonly issueCount: number;
  readonly cardCount: number;
  readonly severitySplit: { readonly high: number; readonly unprioritized: number };
  readonly triage: { readonly missingEvery: number; readonly expectedMissingCount: number };
  readonly cardStates: Readonly<Record<string, number>>;
  readonly operationBounds: { readonly maxIssueNumbersPerList: number; readonly maxWarnings: number };
  readonly expectations: {
    readonly scheduledIssueNumbers: readonly number[];
    readonly omittedScheduledIssueNumberCount: number;
    readonly highBucket: {
      readonly count: number;
      readonly issueNumbers: readonly number[];
      readonly omittedIssueNumberCount: number;
    };
    readonly unprioritizedBucket: {
      readonly count: number;
      readonly issueNumbers: readonly number[];
      readonly omittedIssueNumberCount: number;
    };
    readonly omittedWarningCount: number;
    readonly warningSummary: readonly string[];
  };
}

function readBurstDispatchLoadFixture(): BurstDispatchLoadFixture {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'burst-dispatch-load.json'), 'utf8'),
  ) as BurstDispatchLoadFixture;
}

function readFlakyLivenessReplayFixture(): FlakyLivenessReplayFixture {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'flaky-liveness-replay.json'), 'utf8'),
  ) as FlakyLivenessReplayFixture;
}

function readLargeBacklogLivenessRefillFixture(): LargeBacklogLivenessRefillFixture {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'large-backlog-liveness-refill.json'), 'utf8'),
  ) as LargeBacklogLivenessRefillFixture;
}

vi.mock('../../../src/beast-loop.js', () => {
  return {
    BeastLoop: class {
      private readonly deps: BeastLoopDeps;

      constructor(deps: BeastLoopDeps, config: unknown) {
        this.deps = deps;
        mockLoopConstructions.push({ deps, config });
      }
      run = async () => mockRun(this.deps);
    },
  };
});

import { BeastLoop } from '../../../src/beast-loop.js';

// ── Factories ──

function makeIssue(overrides: Partial<GithubIssue> & { number: number }): GithubIssue {
  return {
    title: `Issue ${overrides.number}`,
    body: `Body for issue ${overrides.number}`,
    labels: [],
    state: 'OPEN',
    url: `https://github.com/org/repo/issues/${overrides.number}`,
    ...overrides,
  };
}

function makeFixtureIssue(fixtureIssue: BurstDispatchIssueFixture): GithubIssue {
  return makeIssue({
    number: fixtureIssue.number,
    title: fixtureIssue.title,
    labels: [...fixtureIssue.labels],
  });
}

function makeTriage(issueNumber: number, complexity: 'one-shot' | 'chunked' = 'one-shot'): TriageResult {
  return {
    issueNumber,
    complexity,
    rationale: `Triage for #${issueNumber}`,
    estimatedScope: '1 file',
  };
}

function makeChunks(issueNumber: number, complexity: 'one-shot' | 'chunked' = 'one-shot'): ChunkDefinition[] {
  if (complexity === 'one-shot') {
    return [
      {
        id: `issue-${issueNumber}`,
        objective: `Fix #${issueNumber}`,
        files: [],
        successCriteria: `Verify #${issueNumber}`,
        verificationCommand: 'npm test',
        dependencies: [],
      },
    ];
  }

  return [
    {
      id: `issue-${issueNumber}-part-1`,
      objective: `Fix #${issueNumber} part 1`,
      files: [],
      successCriteria: `Verify #${issueNumber} part 1`,
      verificationCommand: 'npm test',
      dependencies: [],
    },
    {
      id: `issue-${issueNumber}-part-2`,
      objective: `Fix #${issueNumber} part 2`,
      files: [],
      successCriteria: `Verify #${issueNumber} part 2`,
      verificationCommand: 'npm test',
      dependencies: [`issue-${issueNumber}-part-1`],
    },
  ];
}

// ── Mock builders ──

function mockGraphBuilder(): IssueGraphBuilder {
  return {
    buildForIssue: vi.fn(async (issue: GithubIssue) => {
      const implId = `impl:issue-${issue.number}`;
      const hardenId = `harden:issue-${issue.number}`;
      return {
        tasks: [
          { id: implId, objective: `Fix #${issue.number}`, requiredSkills: [`cli:issue-${issue.number}`], dependsOn: [] },
          { id: hardenId, objective: `Verify #${issue.number}`, requiredSkills: [`cli:issue-${issue.number}/harden`], dependsOn: [implId] },
        ],
      } as PlanGraph;
    }),
    buildChunkDefinitionsForIssue: vi.fn(async (issue: GithubIssue, triage: TriageResult) =>
      makeChunks(issue.number, triage.complexity),
    ),
  } as unknown as IssueGraphBuilder;
}

function mockGit(): GitBranchIsolator {
  return {
    isolate: vi.fn(),
  } as unknown as GitBranchIsolator;
}

function mockLogger(): ILogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function mockCheckpoint(completed: Set<string> = new Set()): ICheckpointStore {
  return {
    has: vi.fn((key: string) => completed.has(key)),
    write: vi.fn(),
    readAll: vi.fn(() => completed),
    clear: vi.fn(),
    recordCommit: vi.fn(),
    lastCommit: vi.fn(() => undefined),
  };
}

function writePlanChunks(planName: string, chunkIds: readonly string[]): string {
  const planDir = resolve(process.cwd(), '.fbeast', 'plans', planName);
  mkdirSync(planDir, { recursive: true });

  chunkIds.forEach((chunkId, index) => {
    const chunkNumber = String(index + 1).padStart(2, '0');
    const filePath = resolve(planDir, `${chunkNumber}_${chunkId}.md`);
    writeFileSync(
      filePath,
      `# Chunk ${chunkNumber}: ${chunkId}\n\n## Objective\n\nResume ${chunkId}\n\n## Files\n\n- test.ts\n\n## Success Criteria\n\nDone\n\n## Verification Command\n\n\`\`\`bash\nnpm test\n\`\`\`\n`,
      'utf8',
    );
    tempPlanFiles.push(filePath);
  });

  return planDir;
}

function makeConfig(overrides: Partial<IssueRunnerConfig> = {}): IssueRunnerConfig {
  return {
    issues: [],
    triageResults: [],
    graphBuilder: mockGraphBuilder(),
    fullDeps: {} as any,
    git: mockGit(),
    budget: 10,
    repo: 'org/repo',
    ...overrides,
  };
}

function makeIssueRuntimeSupport(): IssueRuntimeSupport {
  return {
    planNameForIssue: vi.fn((issueNumber: number) => `issue-${issueNumber}`),
    checkpointForIssue: vi.fn((_issueNumber: number) => mockCheckpoint()),
    artifactsForIssue: vi.fn((issueNumber: number): IssueRuntimeArtifacts => ({
      planName: `issue-${issueNumber}`,
      planDir: `/tmp/plans/issue-${issueNumber}`,
      checkpointFile: `/tmp/issue-${issueNumber}.checkpoint`,
      logFile: `/tmp/issue-${issueNumber}-build.log`,
    })),
  };
}



describe('kanban state mutation idempotency planning', () => {
  it('skips repeated comment, block, unblock, and complete mutations when state already converged', () => {
    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'running', comments: [{ body: 'doctor note', idempotencyKey: 'comment:t_retry:doctor', createdAt: '2026-07-16T10:00:00Z' }] },
      { operation: 'comment', idempotencyKey: 'comment:t_retry:doctor', body: 'doctor note' },
    )).toMatchObject({ action: 'skip', reason: 'comment mutation already converged on an existing matching comment' });

    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'blocked', blockReason: 'usage limit' },
      { operation: 'block', idempotencyKey: 'block:t_retry:usage-limit', body: 'usage limit' },
    )).toMatchObject({ action: 'skip', reason: 'task t_retry is already blocked with the requested reason' });

    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'running' },
      { operation: 'unblock', idempotencyKey: 'unblock:t_retry:doctor' },
    )).toMatchObject({ action: 'skip', reason: 'task t_retry is already not blocked' });

    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'completed', completionSummary: 'merged PR' },
      { operation: 'complete', idempotencyKey: 'complete:t_retry:merged', body: 'merged PR' },
    )).toMatchObject({ action: 'skip', reason: 'task t_retry is already complete with the requested summary' });
  });

  it('uses idempotency records before comments so retrying a reserved mutation is quiet', () => {
    expect(planKanbanStateMutation(
      {
        taskId: 't_retry',
        status: 'running',
        appliedMutations: [{
          operation: 'comment',
          idempotencyKey: 'comment:t_retry:liveness',
          contentHash: 'same-body',
          appliedAt: '2026-07-16T10:00:00Z',
        }],
      },
      { operation: 'comment', idempotencyKey: 'comment:t_retry:liveness', contentHash: 'same-body' },
    )).toMatchObject({
      action: 'skip',
      reason: 'mutation idempotency key was already applied with matching operation/content',
      evidence: expect.arrayContaining(['appliedAt=2026-07-16T10:00:00.000Z']),
    });
  });

  it('recognizes retries that provide the body when the stored content hash is a digest', () => {
    const body = 'doctor note\n';
    const digest = createHash('sha256').update(body).digest('hex');

    expect(planKanbanStateMutation(
      {
        taskId: 't_retry',
        status: 'running',
        appliedMutations: [{
          operation: 'comment',
          idempotencyKey: 'comment:t_retry:liveness',
          contentHash: digest,
        }],
      },
      { operation: 'comment', idempotencyKey: 'comment:t_retry:liveness', body },
    )).toMatchObject({ action: 'skip' });
  });

  it('does not let audit comments prove non-comment state mutations', () => {
    expect(planKanbanStateMutation(
      {
        taskId: 't_retry',
        status: 'running',
        revision: 7,
        comments: [{ body: 'blocked: usage limit', idempotencyKey: 'block:t_retry:usage-limit' }],
      },
      { operation: 'block', idempotencyKey: 'block:t_retry:usage-limit', expectedRevision: 7, body: 'usage limit' },
    )).toMatchObject({ action: 'apply' });
  });

  it('applies new mutations when numeric and serialized revisions match', () => {
    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'running', revision: '7' },
      { operation: 'block', idempotencyKey: 'block:t_retry:new', expectedRevision: 7, body: 'fresh blocker' },
    )).toMatchObject({ action: 'apply' });
  });

  it('applies new mutations only when the compare-and-set revision matches', () => {
    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'running', revision: 7 },
      { operation: 'block', idempotencyKey: 'block:t_retry:new', expectedRevision: 7, body: 'fresh blocker' },
    )).toMatchObject({ action: 'apply' });
  });

  it('returns explicit conflict evidence for stale concurrent updates', () => {
    expect(planKanbanStateMutation(
      { taskId: 't_retry', status: 'running', revision: 8 },
      { operation: 'block', idempotencyKey: 'block:t_retry:stale', expectedRevision: 7, body: 'fresh blocker' },
    )).toMatchObject({
      action: 'conflict',
      reason: 'kanban state revision changed before mutation could be applied',
      evidence: expect.arrayContaining(['expectedRevision=7', 'actualRevision=8', 'status=running']),
    });
  });
});

describe('duplicate worker-card process detector', () => {
  it('detects duplicate and regressive heartbeat writes with worker diagnostics', () => {
    const findings = detectWorkerHeartbeatMonotonicityAnomalies([
      {
        cardId: 't_worker_1',
        pid: 4201,
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 1,
        lastHeartbeatAt: '2026-07-15T09:10:00.000Z',
      },
      {
        cardId: 't_worker_1',
        pid: 4201,
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 1,
        lastHeartbeatAt: '2026-07-15T09:10:00.000Z',
      },
      {
        cardId: 't_worker_1',
        pid: 4201,
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 0,
        lastHeartbeatAt: '2026-07-15T09:09:59.000Z',
      },
      {
        cardId: 't_worker_1',
        pid: 4201,
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 1,
        lastHeartbeatAt: '2026-07-15T09:10:00.000Z',
      },
      {
        cardId: 't_worker_1',
        pid: 4202,
        runId: 'run-12',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 1,
        lastHeartbeatAt: '2026-07-15T09:10:01.000Z',
      },
      {
        cardId: 't_worker_2',
        pid: 4300,
        runId: 'run-11',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 1,
        lastHeartbeatAt: '2026-07-15T09:10:00.000Z',
      },
      {
        cardId: 't_worker_2',
        pid: 4300,
        runId: 'run-11',
        source: 'kanban-heartbeat-writer',
        heartbeatSequence: 2,
        lastHeartbeatAt: '2026-07-15T09:11:00.000Z',
      },
    ]);

    expect(findings).toEqual([
      {
        cardId: 't_worker_1',
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        severity: 'warning',
        code: 'duplicate-heartbeat',
        priorSequence: 1,
        newSequence: 1,
        priorHeartbeatAt: '2026-07-15T09:10:00.000Z',
        newHeartbeatAt: '2026-07-15T09:10:00.000Z',
        message: 'Worker card t_worker_1 heartbeat did not advance: prior sequence 1 at 2026-07-15T09:10:00.000Z, new sequence 1 at 2026-07-15T09:10:00.000Z from kanban-heartbeat-writer',
      },
      {
        cardId: 't_worker_1',
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        severity: 'warning',
        code: 'regressive-heartbeat',
        priorSequence: 1,
        newSequence: 0,
        priorHeartbeatAt: '2026-07-15T09:10:00.000Z',
        newHeartbeatAt: '2026-07-15T09:09:59.000Z',
        message: 'Worker card t_worker_1 heartbeat regressed: prior sequence 1 at 2026-07-15T09:10:00.000Z, new sequence 0 at 2026-07-15T09:09:59.000Z from kanban-heartbeat-writer',
      },
      {
        cardId: 't_worker_1',
        runId: 'run-10',
        source: 'kanban-heartbeat-writer',
        severity: 'warning',
        code: 'duplicate-heartbeat',
        priorSequence: 1,
        newSequence: 1,
        priorHeartbeatAt: '2026-07-15T09:10:00.000Z',
        newHeartbeatAt: '2026-07-15T09:10:00.000Z',
        message: 'Worker card t_worker_1 heartbeat did not advance: prior sequence 1 at 2026-07-15T09:10:00.000Z, new sequence 1 at 2026-07-15T09:10:00.000Z from kanban-heartbeat-writer',
      },
    ]);
  });

  it('reports duplicate live process ownership for the same worker card with structured guidance', () => {
    const findings = detectDuplicateWorkerCardProcesses([
      {
        cardId: 't_worker_1',
        pid: 4202,
        runId: 'run-10',
        issueNumber: 1809,
        owner: 'worker-a',
        status: 'running',
        startedAt: '2026-07-15T09:00:00.000Z',
        lastHeartbeatAt: '2026-07-15T09:10:00.000Z',
      },
      {
        cardId: 't_worker_1',
        pid: 4201,
        runId: 'run-9',
        issueNumber: 1809,
        owner: 'worker-b',
        status: 'claimed',
        startedAt: '2026-07-15T09:05:00.000Z',
        lastHeartbeatAt: '2026-07-15T09:12:00.000Z',
      },
      { cardId: 't_worker_2', pid: 4300, runId: 'run-11', issueNumber: 1810, owner: 'worker-c', status: 'running' },
    ]);

    expect(findings).toEqual([
      {
        cardId: 't_worker_1',
        severity: 'warning',
        processCount: 2,
        pids: [4201, 4202],
        runIds: ['run-10', 'run-9'],
        issueNumbers: [1809],
        owners: ['worker-a', 'worker-b'],
        statuses: ['claimed', 'running'],
        newestStartedAt: '2026-07-15T09:05:00.000Z',
        lastHeartbeatAt: '2026-07-15T09:12:00.000Z',
        message: 'Worker card t_worker_1 has 2 live processes: 4201, 4202',
        guidance: 'Keep one live owner for the worker card, stop or park the duplicate process, then record the surviving PID/run id in PM/liveness output.',
      },
    ]);
  });



  it('keeps blocked live workers visible while ignoring stopped or deleted cards', () => {
    const findings = detectDuplicateWorkerCardProcesses([
      { cardId: 't_blocked', pid: 5101, status: 'blocked', alive: true, runId: 'run-blocked-a' },
      { cardId: 't_blocked', pid: 5102, status: 'blocked', alive: true, runId: 'run-blocked-b' },
      { cardId: 't_stopped', pid: 5103, status: 'stopped' },
      { cardId: 't_stopped', pid: 5104, status: 'deleted' },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      cardId: 't_blocked',
      pids: [5101, 5102],
      runIds: ['run-blocked-a', 'run-blocked-b'],
      statuses: ['blocked'],
    });
  });

  it('ignores terminal, dead, invalid, and repeated-PID snapshots so false positives stay quiet', () => {
    const findings = detectDuplicateWorkerCardProcesses([
      { cardId: 't_complete', pid: 5001, status: 'completed' },
      { cardId: 't_complete', pid: 5002, status: 'done' },
      { cardId: 't_stopped', pid: 5011, status: 'stopped' },
      { cardId: 't_stopped', pid: 5012, status: 'deleted' },
      { cardId: 't_dead', pid: 5003, alive: false, status: 'running' },
      { cardId: 't_dead', pid: 5004, alive: false, status: 'claimed' },
      { cardId: 't_same_pid', pid: 5005, status: 'running' },
      { cardId: 't_same_pid', pid: 5005, status: 'claimed' },
      { cardId: '', pid: 5006, status: 'running' },
      { cardId: 't_invalid_pid', pid: 0, status: 'running' },
    ]);

    expect(findings).toEqual([]);
  });
});

describe('stuck-run watchdog', () => {
  const nowMs = Date.parse('2026-07-16T12:00:00.000Z');

  it('classifies crashed workers and recommends stale PID/current-run cleanup', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_crashed',
        pid: 7401,
        runId: 'run-crash',
        issueNumber: 1678,
        owner: 'doctor',
        status: 'running',
        alive: false,
        lastHeartbeatAt: '2026-07-16T11:55:00.000Z',
        lastOutputAt: '2026-07-16T11:55:30.000Z',
        lastToolActivityAt: '2026-07-16T11:54:00.000Z',
        lastStateTransitionAt: '2026-07-16T11:50:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([
      expect.objectContaining({
        cardId: 't_crashed',
        pid: 7401,
        runId: 'run-crash',
        issueNumber: 1678,
        blockerCategory: 'process-crash',
        confidence: 'high',
        processStatus: 'dead',
        kanbanState: 'running',
        heartbeatAgeMs: 5 * 60 * 1000,
        outputAgeMs: 270_000,
        exitReason: 'process_not_alive',
        restartDisposition: 'retryable',
        nextAction: 'restart-once',
        recommendedAction: expect.stringContaining('clear the stale PID/current-run pointer'),
      }),
    ]);
  });

  it('records crash-only setup failures as HITL doctor replacement instead of blind respawn', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_setup_crash',
        pid: 7410,
        runId: 'run-setup',
        status: 'failed',
        alive: false,
        exitReason: 'spawn_failed',
        lastHeartbeatAt: '2026-07-16T11:59:00.000Z',
      },
    ], { nowMs });

    expect(finding).toMatchObject({
      cardId: 't_setup_crash',
      exitReason: 'spawn_failed',
      pid: 7410,
      heartbeatAgeMs: 60_000,
      restartDisposition: 'hitl',
      nextAction: 'replace-with-doctor',
    });
    expect(finding.evidence).toEqual(expect.arrayContaining([
      'exitReason=spawn_failed',
      'pid=7410',
      'heartbeatAgeMs=60000',
    ]));
    expect(finding.recommendedAction).toContain('Doctor card');
    expect(finding.recommendedAction).not.toContain('respawn one focused worker');
  });

  it('keeps blocked crash cards in HITL instead of auto-respawning them', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_blocked_crash',
        pid: 7411,
        runId: 'run-blocked',
        status: 'blocked',
        alive: false,
        exitReason: 'exit_code_1',
        lastHeartbeatAt: '2026-07-16T11:40:00.000Z',
      },
    ], { nowMs });

    expect(finding).toMatchObject({
      cardId: 't_blocked_crash',
      exitReason: 'exit_code_1',
      restartDisposition: 'hitl',
      nextAction: 'defer-with-evidence',
      recommendedAction: expect.stringContaining('do not auto-respawn over the blocker'),
    });
    expect(finding.recommendedAction).not.toContain('respawn one focused worker');
  });

  it('defers dead workers when waiting evidence names CI or provider gates', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_ci_dead',
        pid: 7414,
        runId: 'run-ci',
        status: 'running',
        alive: false,
        waitingOn: 'CI checks are still queued',
        lastHeartbeatAt: '2026-07-16T11:30:00.000Z',
      },
      {
        cardId: 't_provider_dead',
        pid: 7415,
        runId: 'run-provider',
        status: 'running',
        alive: false,
        waitingOn: 'Codex rate limit reset',
        lastHeartbeatAt: '2026-07-16T11:30:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([
      expect.objectContaining({
        cardId: 't_ci_dead',
        blockerCategory: 'ci-wait',
        restartDisposition: 'hitl',
        nextAction: 'defer-with-evidence',
        recommendedAction: expect.not.stringContaining('respawn one focused worker'),
      }),
      expect.objectContaining({
        cardId: 't_provider_dead',
        blockerCategory: 'provider-wait',
        restartDisposition: 'hitl',
        nextAction: 'defer-with-evidence',
        recommendedAction: expect.not.stringContaining('respawn one focused worker'),
      }),
    ]);
  });

  it('normalizes direct restart-contract Kanban state before choosing HITL defer', () => {
    const contract = buildWorkerCrashOnlyRestartContract(
      {
        cardId: 't_direct_blocked',
        pid: 7418,
        status: 'running',
        alive: false,
      },
      {
        category: 'process-crash',
        processStatus: 'dead',
        kanbanState: 'Blocked',
      },
    );

    expect(contract).toMatchObject({
      disposition: 'hitl',
      nextAction: 'defer-with-evidence',
      kanbanState: 'blocked',
    });
  });

  it('redacts sensitive exit reasons before exposing restart evidence', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_secret_exit',
        pid: 7416,
        status: 'failed',
        alive: false,
        exitReason: `spawn failed with token=${'github_pat_' + '12345678901234567890abcdef'}`,
        lastHeartbeatAt: '2026-07-16T11:59:00.000Z',
      },
    ], { nowMs });

    expect(finding.exitReason).toBe('spawn failed with token=[REDACTED]');
    expect(finding.evidence).toContain('exitReason=spawn failed with token=[REDACTED]');
    expect(finding.evidence.join('\n')).not.toContain('github_pat_');
  });

  it('redacts key-value secrets in exit reasons before exposing restart evidence', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_key_secret_exit',
        pid: 7416,
        status: 'failed',
        alive: false,
        exitReason: 'supervisor stderr AWS_SECRET_ACCESS_KEY=abc123 DB_PASSWORD=secret-value',
        lastHeartbeatAt: '2026-07-16T11:59:00.000Z',
      },
    ], { nowMs });

    expect(finding.exitReason).toBe('supervisor stderr AWS_SECRET_ACCESS_KEY=<redacted> DB_PASSWORD=<redacted>');
    expect(finding.evidence).toContain('exitReason=supervisor stderr AWS_SECRET_ACCESS_KEY=<redacted> DB_PASSWORD=<redacted>');
    expect(finding.evidence.join('\n')).not.toContain('abc123');
    expect(finding.evidence.join('\n')).not.toContain('secret-value');
  });

  it('respects explicit blocker categories before stale waiting text', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_explicit_dispatcher_blocker',
        pid: 7416,
        status: 'running',
        alive: true,
        blockerCategory: 'dispatcher-bug',
        waitingOn: 'old note: CI checks are still running',
        lastHeartbeatAt: '2026-07-16T10:00:00.000Z',
        lastOutputAt: '2026-07-16T10:00:00.000Z',
        lastToolActivityAt: '2026-07-16T10:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T10:00:00.000Z',
      },
    ], { nowMs });

    expect(finding).toMatchObject({
      cardId: 't_explicit_dispatcher_blocker',
      blockerCategory: 'dispatcher-bug',
      restartDisposition: 'hitl',
      nextAction: 'defer-with-evidence',
    });
    expect(finding.recommendedAction).toContain('dispatcher metadata');
  });

  it('keeps alive stale nonterminal workers in HITL instead of terminal no-op', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_alive_unknown',
        pid: 7417,
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T10:00:00.000Z',
        lastOutputAt: '2026-07-16T10:00:00.000Z',
        lastToolActivityAt: '2026-07-16T10:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T10:00:00.000Z',
      },
    ], { nowMs });

    expect(finding).toMatchObject({
      cardId: 't_alive_unknown',
      processStatus: 'alive',
      kanbanState: 'running',
      restartDisposition: 'hitl',
      nextAction: 'defer-with-evidence',
    });
  });

  it('suppresses duplicate respawns when another PID already owns the worker card', () => {
    const [finding] = detectStuckRunWatchdogFindings([
      {
        cardId: 't_duplicate_respawn',
        pid: 7412,
        runId: 'run-older',
        status: 'running',
        alive: false,
        exitReason: 'unknown_exit',
        siblingPids: [7413],
        lastHeartbeatAt: '2026-07-16T11:30:00.000Z',
      },
    ], { nowMs });

    expect(finding).toMatchObject({
      cardId: 't_duplicate_respawn',
      restartDisposition: 'hitl',
      nextAction: 'suppress-duplicate-respawn',
      recommendedAction: expect.stringContaining('Suppress duplicate respawn'),
    });
    expect(finding.evidence).toContain('siblingPids=7413');
  });

  it('derives duplicate respawn siblings from the watchdog snapshot set', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_derived_duplicate',
        pid: 7412,
        runId: 'run-dead',
        status: 'running',
        alive: false,
        lastHeartbeatAt: '2026-07-16T11:30:00.000Z',
      },
      {
        cardId: 't_derived_duplicate',
        pid: 7413,
        runId: 'run-live',
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T11:59:00.000Z',
      },
    ], { nowMs });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      cardId: 't_derived_duplicate',
      pid: 7412,
      restartDisposition: 'hitl',
      nextAction: 'suppress-duplicate-respawn',
    });
    expect(findings[0].evidence).toContain('siblingPids=7413');
  });

  it('coalesces multiple dead attempts into one restart recommendation', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_repeated_dead_attempts',
        pid: 7412,
        runId: 'run-dead-1',
        status: 'running',
        alive: false,
        lastHeartbeatAt: '2026-07-16T11:30:00.000Z',
      },
      {
        cardId: 't_repeated_dead_attempts',
        pid: 7413,
        runId: 'run-dead-2',
        status: 'running',
        alive: false,
        lastHeartbeatAt: '2026-07-16T11:31:00.000Z',
      },
    ], { nowMs });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      cardId: 't_repeated_dead_attempts',
      pid: 7412,
      restartDisposition: 'retryable',
      nextAction: 'restart-once',
    });
  });

  it('does not derive duplicate siblings from terminal stale snapshots', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_terminal_sibling',
        pid: 7412,
        runId: 'run-dead',
        status: 'running',
        alive: false,
        lastHeartbeatAt: '2026-07-16T11:30:00.000Z',
      },
      {
        cardId: 't_terminal_sibling',
        pid: 7413,
        runId: 'run-old-done',
        status: 'completed',
        alive: true,
        lastHeartbeatAt: '2026-07-16T11:59:00.000Z',
      },
    ], { nowMs });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      cardId: 't_terminal_sibling',
      pid: 7412,
      restartDisposition: 'retryable',
      nextAction: 'restart-once',
    });
    expect(findings[0].evidence).not.toContain('siblingPids=7413');
  });

  it('normalizes exported restart-contract Kanban state before suppressing blocked respawns', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_direct_blocked',
      pid: 7418,
      status: 'Blocked',
      alive: false,
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'Blocked',
    });

    expect(contract).toMatchObject({
      disposition: 'hitl',
      nextAction: 'defer-with-evidence',
      kanbanState: 'blocked',
    });
  });

  it('defers pending approval Kanban states before dead-process retry', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_pending_approval',
      pid: 7418,
      status: 'pending approval',
      alive: false,
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'pending approval',
    });

    expect(contract).toMatchObject({
      disposition: 'hitl',
      nextAction: 'defer-with-evidence',
      kanbanState: 'pending-approval',
    });
  });

  it('defers dead workers with active PR/worktree ownership before restart-once', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_active_owner',
      pid: 7418,
      status: 'running',
      alive: false,
      exitReason: 'respawn_guarded(active_pr)',
      activePrUrl: 'https://github.com/djm204/frankenbeast/pull/2560',
      activeWorktreePath: '/tmp/frankenbeast/.worktrees/t_active_owner',
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'running',
    });

    expect(contract).toMatchObject({
      disposition: 'hitl',
      nextAction: 'defer-with-evidence',
      kanbanState: 'running',
    });
    expect(contract.evidence).toEqual(expect.arrayContaining([
      'activePr=https://github.com/djm204/frankenbeast/pull/2560',
      'activeWorktree=/tmp/frankenbeast/.worktrees/t_active_owner',
    ]));
  });

  it('keeps direct terminal restart contracts as no-op before dead-process retry', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_direct_completed',
      pid: 7419,
      status: 'completed',
      alive: false,
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'completed',
    });

    expect(contract).toMatchObject({
      disposition: 'terminal',
      nextAction: 'no-op',
      kanbanState: 'completed',
    });
  });

  it('treats crash-like terminal statuses as retryable process crashes', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_direct_failed',
      pid: 7422,
      status: 'failed',
      alive: false,
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'failed',
    });

    expect(contract).toMatchObject({
      disposition: 'retryable',
      nextAction: 'restart-once',
      kanbanState: 'failed',
    });
  });

  it('keeps intentional operator exits non-retryable in direct restart contracts', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_operator_stop',
      pid: 7420,
      status: 'running',
      alive: false,
      exitReason: 'operator_stop',
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'running',
    });

    expect(contract).toMatchObject({
      exitReason: 'operator_stop',
      disposition: 'terminal',
      nextAction: 'no-op',
    });
  });

  it('defers external signal exits for operator investigation in direct restart contracts', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_signal_stop',
      pid: 7423,
      status: 'running',
      alive: false,
      exitReason: 'signal_SIGTERM',
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'running',
    });

    expect(contract).toMatchObject({
      exitReason: 'signal_SIGTERM',
      disposition: 'hitl',
      nextAction: 'defer-with-evidence',
    });
  });

  it('restarts retryable signal-killed workers without active ownership', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_signal_kill',
      pid: 7425,
      status: 'running',
      alive: false,
      exitReason: 'signal_SIGKILL',
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'running',
    });

    expect(contract).toMatchObject({
      exitReason: 'signal_SIGKILL',
      disposition: 'retryable',
      nextAction: 'restart-once',
    });
  });

  it('routes start_failed exit reasons to doctor replacement', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_start_failed',
      pid: 7421,
      status: 'running',
      alive: false,
      exitReason: 'start_failed',
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'running',
    });

    expect(contract).toMatchObject({
      exitReason: 'start_failed',
      disposition: 'hitl',
      nextAction: 'replace-with-doctor',
    });
  });

  it('routes spawn_failure exit reasons to doctor replacement', () => {
    const contract = buildWorkerCrashOnlyRestartContract({
      cardId: 't_spawn_failure',
      pid: 7424,
      status: 'running',
      alive: false,
      exitReason: 'spawn_failure',
    }, {
      category: 'process-crash',
      processStatus: 'dead',
      kanbanState: 'running',
    });

    expect(contract).toMatchObject({
      exitReason: 'spawn_failure',
      disposition: 'hitl',
      nextAction: 'replace-with-doctor',
    });
  });

  it('uses known blocker hints to report approval gates with concrete remediation', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_approval',
        pid: 7402,
        runId: 'run-approval',
        status: 'running',
        alive: true,
        blockerCategory: 'approval-gate',
        waitingOn: 'approval token for git push --force-with-lease',
        lastHeartbeatAt: '2026-07-16T10:00:00.000Z',
        lastOutputAt: '2026-07-16T10:05:00.000Z',
        lastToolActivityAt: '2026-07-16T10:05:00.000Z',
        lastStateTransitionAt: '2026-07-16T09:30:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_approval',
      blockerCategory: 'approval-gate',
      confidence: 'high',
      heartbeatAgeMs: 7_200_000,
      toolActivityAgeMs: 6_900_000,
      stateTransitionAgeMs: 9_000_000,
      processStatus: 'alive',
      recommendedAction: expect.stringContaining('approval-cop'),
      evidence: expect.arrayContaining([
        'waitingOn=approval token for git push --force-with-lease',
        'blockerCategory=approval-gate',
      ]),
    });
  });

  it('guards against false positives for healthy long-running CI/provider waits', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_ci_wait',
        pid: 7403,
        status: 'running',
        alive: true,
        blockerCategory: 'ci-wait',
        waitingOn: 'CI checks are still queued',
        lastHeartbeatAt: '2026-07-16T11:45:00.000Z',
        lastOutputAt: '2026-07-16T11:40:00.000Z',
        lastToolActivityAt: '2026-07-16T10:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T10:00:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('does not treat missing optional activity signals as stale', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_heartbeat_only',
        pid: 7405,
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T11:55:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('keeps normally completed dead workers quiet', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_done',
        pid: 7406,
        status: 'done',
        alive: false,
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:00:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('keeps terminal cards quiet even when stale waitingOn text mentions failures', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_done_with_stale_waiting_on',
        pid: 7406,
        status: 'done',
        alive: true,
        waitingOn: 'CI checks failed before the card completed',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('keeps successful terminal cards quiet even when stale blocker metadata mentions crashes', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_done_with_stale_crash_blocker',
        pid: 7406,
        status: 'done',
        alive: true,
        blockerCategory: 'process-crash',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('reports terminal crash statuses when alive is false without waitingOn hints', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_terminal_crash',
        pid: 7407,
        status: 'crashed',
        alive: false,
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_terminal_crash',
      blockerCategory: 'process-crash',
      confidence: 'high',
      processStatus: 'dead',
      kanbanState: 'crashed',
    });
  });

  it('defers dead workers when explicit wait hints remain', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_dead_ci_wait',
        pid: 7407,
        status: 'running',
        alive: false,
        blockerCategory: 'ci-wait',
        waitingOn: 'CI checks were queued before the process exited',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_dead_ci_wait',
      blockerCategory: 'ci-wait',
      confidence: 'high',
      processStatus: 'dead',
      restartDisposition: 'hitl',
      nextAction: 'defer-with-evidence',
    });
  });

  it('reports dead workers even when activity timestamps are absent', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_dead_without_activity',
        pid: 7407,
        status: 'running',
        alive: false,
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_dead_without_activity',
      blockerCategory: 'process-crash',
      confidence: 'high',
      processStatus: 'dead',
    });
  });

  it('reports terminal crash statuses even when liveness probes are omitted', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_crashed_without_probe',
        pid: 7407,
        status: 'failed',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_crashed_without_probe',
      blockerCategory: 'process-crash',
      confidence: 'medium',
      processStatus: 'alive',
      kanbanState: 'failed',
    });
  });

  it('reports crash-only snapshots even when activity timestamps are absent', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_crashed_without_activity',
        pid: 7407,
        status: 'failed',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_crashed_without_activity',
      blockerCategory: 'process-crash',
      confidence: 'medium',
      processStatus: 'alive',
      kanbanState: 'failed',
    });
  });

  it('lets explicit crash status override stale blocker hints', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_failed_stale_ci_wait',
        pid: 7407,
        status: 'failed',
        waitingOn: 'CI checks were queued before the process exited',
        lastStateTransitionAt: '2026-07-16T11:58:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_failed_stale_ci_wait',
      blockerCategory: 'process-crash',
      confidence: 'medium',
      processStatus: 'alive',
      kanbanState: 'failed',
    });
  });

  it('does not infer crashes from ordinary process wait wording without stale evidence', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_waiting_on_child_process',
        pid: 7407,
        status: 'processing',
        waitingOn: 'waiting on child process',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('reports stale heartbeat snapshots even when optional activity timestamps are absent', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_stale_heartbeat_only',
        pid: 7408,
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        startedAt: '2026-07-16T07:30:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_stale_heartbeat_only',
      blockerCategory: 'unknown',
      confidence: 'low',
      heartbeatAgeMs: 14_400_000,
      stateTransitionAgeMs: 16_200_000,
      processStatus: 'alive',
    });
  });

  it('reports stale heartbeat-only snapshots when heartbeat is the only provided activity signal', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_stale_heartbeat_only_no_start',
        pid: 7408,
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_stale_heartbeat_only_no_start',
      blockerCategory: 'unknown',
      confidence: 'low',
      heartbeatAgeMs: 14_400_000,
      processStatus: 'alive',
    });
  });

  it('reports partial stale snapshots when all provided activity signals are stale', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_heartbeat_output_only',
        pid: 7408,
        status: 'running',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:05:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_heartbeat_output_only',
      blockerCategory: 'unknown',
      confidence: 'low',
      heartbeatAgeMs: 14_400_000,
      outputAgeMs: 14_100_000,
      processStatus: 'alive',
    });
  });

  it('keeps stale cards visible when the PID is missing or unreadable', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_missing_pid',
        pid: 0,
        status: 'running',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_missing_pid',
      pid: 0,
      processStatus: 'unknown',
      confidence: 'low',
    });
  });

  it('does not treat fresh unreadable PID snapshots as dead crashes', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_fresh_missing_pid',
        pid: 0,
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T11:55:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('redacts token-like values from waitingOn evidence', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_secret_wait',
        pid: 7411,
        status: 'running',
        alive: true,
        waitingOn: 'approval token=ghr_abcdefghijklmnopqrstuvwx.yz-123456 and api token: sk-abcdefghijklmnopqrstuvwxyz123456',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:00:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0].evidence).toContain('waitingOn=approval token=[REDACTED] and api token=[REDACTED]');
    expect(findings[0].evidence.join('\n')).not.toContain('ghr_');
    expect(findings[0].evidence.join('\n')).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('keeps provider token and checkpoint text out of approval and CI buckets', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_provider_tokens',
        pid: 7409,
        status: 'running',
        alive: true,
        waitingOn: 'provider budget remaining 0 tokens',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:00:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
      {
        cardId: 't_checkpoint_wait',
        pid: 7410,
        status: 'running',
        alive: true,
        waitingOn: 'checkpoint handoff is pending',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:00:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardId: 't_provider_tokens',
        blockerCategory: 'provider-wait',
      }),
      expect.objectContaining({
        cardId: 't_checkpoint_wait',
        blockerCategory: 'unknown',
      }),
    ]));
  });

  it('prioritizes approval cues over broad provider wording', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_provider_approval',
        pid: 7412,
        status: 'running',
        alive: true,
        waitingOn: 'Codex model operation needs operator approval',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:00:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_provider_approval',
      blockerCategory: 'approval-gate',
    });
  });

  it('infers a specific blocker when callers provide unknown with useful waiting text', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_unknown_ci_wait',
        pid: 7413,
        status: 'running',
        alive: true,
        blockerCategory: 'unknown',
        waitingOn: 'CI checks are queued',
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T08:00:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_unknown_ci_wait',
      blockerCategory: 'ci-wait',
    });
  });

  it('suppresses watchdog findings when any provided activity signal is fresh', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_fresh_output',
        pid: 7414,
        status: 'running',
        alive: true,
        lastHeartbeatAt: '2026-07-16T08:00:00.000Z',
        lastOutputAt: '2026-07-16T11:58:00.000Z',
        lastToolActivityAt: '2026-07-16T08:00:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:00:00.000Z',
      },
    ], { nowMs });

    expect(findings).toEqual([]);
  });

  it('escalates stale provider waits after every activity signal exceeds grace', () => {
    const findings = detectStuckRunWatchdogFindings([
      {
        cardId: 't_provider',
        pid: 7404,
        status: 'running',
        alive: true,
        waitingOn: 'provider quota reset',
        lastHeartbeatAt: '2026-07-16T08:30:00.000Z',
        lastOutputAt: '2026-07-16T08:25:00.000Z',
        lastToolActivityAt: '2026-07-16T08:20:00.000Z',
        lastStateTransitionAt: '2026-07-16T08:15:00.000Z',
      },
    ], { nowMs });

    expect(findings[0]).toMatchObject({
      cardId: 't_provider',
      blockerCategory: 'provider-wait',
      confidence: 'high',
      recommendedAction: expect.stringContaining('provider quota'),
    });
  });
});

describe('degraded-mode worker routing policy', () => {
  it('defers fresh worker starts during degraded backpressure with operator guidance', () => {
    const issue = makeIssue({ number: 1818 });
    const route = routeIssueWorkerForDegradedMode({
      issue,
      checkpointHasIssueProgress: false,
      backpressureDecision: {
        allowed: false,
        reasons: ['active processes 8 reached limit 8'],
        signals: { activeProcesses: 8, failedStarts: 0, inFlightBacklog: 0 },
        alerts: [],
        dependencyCircuitBreakers: [],
      },
    });

    expect(route).toEqual({
      mode: 'degraded',
      action: 'defer-fresh-start',
      issueNumber: 1818,
      reason: 'backpressure: active processes 8 reached limit 8',
      guidance: 'Defer this fresh worker start until capacity/dependency signals recover; keep the skip reason in liveness output.',
      checkpointHasIssueProgress: false,
      graphHasCheckpointProgress: false,
      graphComplete: false,
    });
  });

  it('routes checkpointed work to resume during degraded mode instead of starting a duplicate worker', () => {
    const issue = makeIssue({ number: 1818 });
    const route = routeIssueWorkerForDegradedMode({
      issue,
      checkpointHasIssueProgress: true,
      graphHasCheckpointProgress: true,
      stopRemainingReason: 'backpressure: queue depth 12 exceeds limit 10',
    });

    expect(route).toMatchObject({
      mode: 'degraded',
      action: 'resume-checkpointed',
      issueNumber: 1818,
      reason: 'backpressure: queue depth 12 exceeds limit 10',
      checkpointHasIssueProgress: true,
      graphHasCheckpointProgress: true,
      graphComplete: false,
    });
    expect(route.guidance).toContain('Resume checkpointed work during degraded mode');
  });

  it('keeps the normal route explicit when no degradation signal is active', () => {
    const route = routeIssueWorkerForDegradedMode({
      issue: makeIssue({ number: 1818 }),
      checkpointHasIssueProgress: false,
      backpressureDecision: {
        allowed: true,
        reasons: [],
        signals: { activeProcesses: 0, failedStarts: 0, inFlightBacklog: 0 },
        alerts: [],
        dependencyCircuitBreakers: [],
      },
    });

    expect(route).toMatchObject({
      mode: 'normal',
      action: 'start-fresh',
      issueNumber: 1818,
    });
  });
});

describe('IssueRunner', () => {
  let runner: IssueRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoopConstructions.length = 0;
    mockRun.mockReset();
    mockRun.mockImplementation(async (deps?: BeastLoopDeps) => {
      // Default mock behavior: success with some tokens used
      const result = {
        status: 'completed',
        tokenSpend: { totalTokens: 200 },
        taskResults: [
          { taskId: 'impl:dummy', status: 'success' },
          { taskId: 'harden:dummy', status: 'success' },
        ],
      } as unknown as BeastResult;
      await deps?.prCreator?.create?.(result, undefined);
      return result;
    });
    runner = new IssueRunner();
  });

  afterEach(() => {
    for (const file of tempPlanFiles.splice(0)) {
      rmSync(file, { force: true });
    }
  });

  describe('run() basic contract', () => {
    it('returns empty array when no issues provided', async () => {
      const config = makeConfig({ issues: [], triageResults: [] });
      const outcomes = await runner.run(config);
      expect(outcomes).toEqual([]);
    });

    it('returns IssueOutcome[] with one entry per issue', async () => {
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({ issues, triageResults: triages });
      const outcomes = await runner.run(config);
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]!.issueNumber).toBe(1);
      expect(outcomes[1]!.issueNumber).toBe(2);
    });
  });

  describe('severity-priority ordering', () => {
    it('processes critical issues before high before medium before low', async () => {
      const issues = [
        makeIssue({ number: 1, labels: ['low'] }),
        makeIssue({ number: 2, labels: ['critical'] }),
        makeIssue({ number: 3, labels: ['medium'] }),
        makeIssue({ number: 4, labels: ['high'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2), makeTriage(3), makeTriage(4)];
      const config = makeConfig({ issues, triageResults: triages });
      const outcomes = await runner.run(config);

      const order = outcomes.map(o => o.issueNumber);
      expect(order).toEqual([2, 4, 3, 1]);
    });

    it('builds a structured scheduler fairness report for PM/liveness output', () => {
      const issues = [
        makeIssue({ number: 31, labels: [] }),
        makeIssue({ number: 32, labels: ['low'] }),
        makeIssue({ number: 33, labels: ['critical'] }),
        makeIssue({ number: 34, labels: ['medium'] }),
      ];
      const triages = [makeTriage(31), makeTriage(32), makeTriage(33), makeTriage(34)];

      const report = buildIssueSchedulerFairnessReport(issues, triages);

      expect(report).toMatchObject({
        totalIssues: 4,
        scheduledIssueNumbers: [33, 34, 32, 31],
        buckets: [
          { severity: 'critical', issueNumbers: [33], count: 1 },
          { severity: 'high', issueNumbers: [], count: 0 },
          { severity: 'medium', issueNumbers: [34], count: 1 },
          { severity: 'low', issueNumbers: [32], count: 1 },
          { severity: 'unprioritized', issueNumbers: [31], count: 1 },
        ],
        warnings: ['issue #31 has no recognized severity label and is scheduled after prioritized work'],
      });
      expect(report.effectivePriorities).toEqual([
        expect.objectContaining({ issueNumber: 33, priority: 'critical', blockerStatus: 'eligible' }),
        expect.objectContaining({ issueNumber: 34, priority: 'medium', blockerStatus: 'eligible' }),
        expect.objectContaining({ issueNumber: 32, priority: 'low', blockerStatus: 'eligible' }),
        expect.objectContaining({ issueNumber: 31, priority: 'unprioritized', blockerStatus: 'eligible' }),
      ]);
    });

    it('ages eligible queued medium/low work ahead of newer high-priority work without bypassing blocked/HITL safety', async () => {
      const nowMs = Date.parse('2026-07-16T00:00:00.000Z');
      const issues = [
        makeIssue({
          number: 61,
          labels: ['high'],
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T12:00:00.000Z',
        }),
        makeIssue({
          number: 62,
          labels: ['medium', 'orchestrator'],
          createdAt: '2026-06-10T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
        }),
        makeIssue({
          number: 63,
          labels: ['low'],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        }),
        makeIssue({
          number: 66,
          labels: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
        makeIssue({
          number: 64,
          labels: ['medium', 'blocked'],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        }),
        makeIssue({
          number: 65,
          labels: ['medium', 'hitl'],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        }),
      ];
      const triages = issues.map(issue => makeTriage(issue.number));
      const config = makeConfig({ issues, triageResults: triages });

      vi.useFakeTimers();
      vi.setSystemTime(new Date(nowMs));
      const report = buildIssueSchedulerFairnessReport(issues, triages, { nowMs });
      const outcomes = await runner.run(config);
      vi.useRealTimers();

      expect(report.scheduledIssueNumbers).toEqual([63, 62, 61, 66, 64, 65]);
      expect(outcomes.map(outcome => outcome.issueNumber)).toEqual([63, 62, 61, 66, 64, 65]);
      expect(outcomes.find(outcome => outcome.issueNumber === 64)).toMatchObject({ status: 'skipped', error: expect.stringContaining('deferred by scheduler') });
      expect(outcomes.find(outcome => outcome.issueNumber === 65)).toMatchObject({ status: 'skipped', error: expect.stringContaining('deferred by scheduler') });
      expect(report.effectivePriorities).toEqual([
        expect.objectContaining({ issueNumber: 63, priority: 'low', ageDays: 76, ageBoost: 2, effectivePriorityRank: 1, blockerStatus: 'eligible', riskLane: 'standard', freshness: 'stale' }),
        expect.objectContaining({ issueNumber: 62, priority: 'medium', ageDays: 36, ageBoost: 2, effectivePriorityRank: 1, blockerStatus: 'eligible', riskLane: 'orchestrator', freshness: 'stale' }),
        expect.objectContaining({ issueNumber: 61, priority: 'high', ageDays: 1, ageBoost: 0, effectivePriorityRank: 1, blockerStatus: 'eligible', riskLane: 'standard', freshness: 'fresh' }),
        expect.objectContaining({ issueNumber: 66, priority: 'unprioritized', ageBoost: 0, effectivePriorityRank: 4, blockerStatus: 'eligible' }),
        expect.objectContaining({ issueNumber: 64, priority: 'medium', ageBoost: 0, blockerStatus: 'blocked' }),
        expect.objectContaining({ issueNumber: 65, priority: 'medium', ageBoost: 0, blockerStatus: 'hitl' }),
      ]);
      expect(evaluateIssueSchedulingScore(issues[4]!, nowMs).explanation).toContain('blocker=blocked');

      const freshCritical = evaluateIssueSchedulingScore(
        makeIssue({ number: 67, labels: ['critical'], createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' }),
        nowMs,
      );
      const priorityCritical = evaluateIssueSchedulingScore(
        makeIssue({ number: 68, labels: ['priority:critical'], createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' }),
        nowMs,
      );
      const priorityHigh = evaluateIssueSchedulingScore(
        makeIssue({ number: 69, labels: ['priority:high'], createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' }),
        nowMs,
      );
      const agedMedium = evaluateIssueSchedulingScore(issues[1]!, nowMs);
      expect(freshCritical.effectivePriorityRank).toBe(0);
      expect(priorityCritical.effectivePriorityRank).toBe(0);
      expect(priorityHigh.effectivePriorityRank).toBe(1);
      expect(agedMedium.effectivePriorityRank).toBe(1);
      expect(freshCritical.score).toBeLessThan(agedMedium.score);
    });

    it('reports missing triage as an explicit scheduler fairness edge case', () => {
      const report = buildIssueSchedulerFairnessReport(
        [makeIssue({ number: 41, labels: ['high'] })],
        [],
      );

      expect(report.warnings).toEqual([
        'issue #41 has no triage result and will fail before execution if approved',
      ]);
    });

    it('bounds scheduler liveness payloads under large refill queues while preserving authoritative counts', () => {
      const fixture = readLargeBacklogLivenessRefillFixture();
      const issues = Array.from({ length: fixture.issueCount }, (_, index) => makeIssue({
        number: 10_000 + index,
        labels: index < fixture.severitySplit.high ? ['high'] : [],
      }));
      const triages = issues
        .filter((_, index) => index % fixture.triage.missingEvery !== 0)
        .map(issue => makeTriage(issue.number));

      const report = buildIssueSchedulerFairnessReport(issues, triages, fixture.operationBounds);

      expect(fixture.description).toContain('Large backlog liveness/refill fixture');
      expect(Object.values(fixture.cardStates).reduce((total, count) => total + count, 0)).toBe(fixture.cardCount);
      expect(report.totalIssues).toBe(fixture.issueCount);
      expect(report.scheduledIssueNumbers).toEqual(fixture.expectations.scheduledIssueNumbers);
      expect(report.scheduledIssueNumbers.length).toBeLessThanOrEqual(fixture.operationBounds.maxIssueNumbersPerList);
      expect(report.scheduledIssueNumbersTruncated).toBe(true);
      expect(report.omittedScheduledIssueNumberCount).toBe(fixture.expectations.omittedScheduledIssueNumberCount);
      expect(report.buckets.find(bucket => bucket.severity === 'high')).toMatchObject({
        ...fixture.expectations.highBucket,
        issueNumbersTruncated: true,
      });
      expect(report.buckets.find(bucket => bucket.severity === 'unprioritized')).toMatchObject({
        ...fixture.expectations.unprioritizedBucket,
        issueNumbersTruncated: true,
      });
      expect(report.warnings).toHaveLength(fixture.operationBounds.maxWarnings);
      expect(report.warningsTruncated).toBe(true);
      expect(report.omittedWarningCount).toBe(fixture.expectations.omittedWarningCount);
      expect(report.warningSummary).toEqual(fixture.expectations.warningSummary);
    });

    it('logs the scheduler fairness report before executing approved issues', async () => {
      const logger = mockLogger();
      const issues = [makeIssue({ number: 51, labels: ['low'] }), makeIssue({ number: 52, labels: ['critical'] })];
      const triages = [makeTriage(51), makeTriage(52)];
      const config = makeConfig({ issues, triageResults: triages, logger });

      await runner.run(config);

      expect(logger.info).toHaveBeenCalledWith(
        '[issues] Scheduler fairness report',
        expect.objectContaining({
          totalIssues: 2,
          scheduledIssueNumbers: [52, 51],
          warnings: [],
        }),
        'issues',
      );
    });
  });

  describe('per-issue execution', () => {
    it('calls graphBuilder.buildChunkDefinitionsForIssue() for each issue', async () => {
      const graphBuilder = mockGraphBuilder();
      const issues = [makeIssue({ number: 42 })];
      const triages = [makeTriage(42)];
      const config = makeConfig({ issues, triageResults: triages, graphBuilder });

      await runner.run(config);

      expect(graphBuilder.buildChunkDefinitionsForIssue).toHaveBeenCalledOnce();
      expect(graphBuilder.buildChunkDefinitionsForIssue).toHaveBeenCalledWith(issues[0], triages[0]);
    });

    it('instantiates BeastLoop with issue-specific deps and runs it', async () => {
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({ issues, triageResults: triages });

      await runner.run(config);

      expect(mockRun).toHaveBeenCalled();
    });

    it('passes tracing opt-in through to issue-specific BeastLoop runs', async () => {
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({ issues, triageResults: triages, enableTracing: true });

      await runner.run(config);

      expect(mockLoopConstructions[0]?.config).toEqual(expect.objectContaining({
        enableTracing: true,
      }));
    });

    it('registers executable one-shot cli skills in BeastLoop deps', async () => {
      const issues = [makeIssue({ number: 7 })];
      const triages = [makeTriage(7)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        fullDeps: {
          skills: {
            hasSkill: vi.fn(() => false),
            getAvailableSkills: vi.fn(() => []),
            execute: vi.fn(),
          },
        } as unknown as BeastLoopDeps,
      });

      await runner.run(config);

      const issueDeps = mockLoopConstructions[0]!.deps;
      expect(issueDeps.skills.hasSkill('cli:01_issue-7')).toBe(true);
      expect(issueDeps.skills.getAvailableSkills()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'cli:01_issue-7', executionType: 'cli' }),
        ]),
      );
    });

    it('creates branch fix/issue-<N> via git.isolate()', async () => {
      const git = mockGit();
      const issues = [makeIssue({ number: 99 })];
      const triages = [makeTriage(99)];
      const config = makeConfig({ issues, triageResults: triages, git });

      await runner.run(config);

      expect(git.isolate).toHaveBeenCalledWith('issue-99');
    });
  });

  describe('failure handling', () => {
    it('records failed outcome when BeastLoop throws, continues to next issue', async () => {
      mockRun.mockRejectedValueOnce(new Error('compile error'));
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({ issues, triageResults: triages });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]!.status).toBe('failed');
      expect(outcomes[0]!.error).toContain('compile error');
      expect(outcomes[1]!.status).toBe('fixed');
    });

    it('records failed outcome when graphBuilder throws', async () => {
      const graphBuilder = {
        buildChunkDefinitionsForIssue: vi.fn().mockRejectedValueOnce(new Error('LLM down')),
      } as unknown as IssueGraphBuilder;
      const issues = [makeIssue({ number: 10 })];
      const triages = [makeTriage(10)];
      const config = makeConfig({ issues, triageResults: triages, graphBuilder });

      const outcomes = await runner.run(config);

      expect(outcomes[0]!.status).toBe('failed');
      expect(outcomes[0]!.error).toContain('LLM down');
    });
  });

  describe('budget management', () => {
    it('stops iteration and skips remaining issues when budget exceeded', async () => {
      mockRun.mockImplementation(async () => ({
        status: 'completed',
        tokenSpend: { totalTokens: 1_200_000 },
        taskResults: [
          { taskId: 'impl:dummy', status: 'success' },
          { taskId: 'harden:dummy', status: 'success' },
        ],
      }) as any);
      const issues = [
        makeIssue({ number: 1, labels: ['critical'] }),
        makeIssue({ number: 2, labels: ['high'] }),
      ];
      const triages = [makeTriage(1), makeTriage(2)];
      // Budget of $1 → 1_000_000 tokens. First issue uses 1.2M tokens
      const config = makeConfig({
        issues,
        triageResults: triages,
        budget: 1,
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]!.status).toBe('fixed');
      expect(outcomes[1]!.status).toBe('skipped');
    });
  });

  describe('backpressure controls', () => {
    it('loads the burst dispatch fixture and classifies overload versus recovered capacity', async () => {
      const fixture = readBurstDispatchLoadFixture();

      expect(fixture.description).toContain('Burst dispatch load fixture');
      expect(fixture.issues.map(issue => issue.number)).toEqual([182401, 182402]);

      for (const snapshot of fixture.snapshots) {
        const decision = await evaluateIssueBackpressure(
          { thresholds: fixture.thresholds, signals: () => snapshot.signals },
          {
            issue: makeFixtureIssue(fixture.issues[0]!),
            index: 0,
            totalIssues: fixture.issues.length,
            pendingIssueCount: fixture.issues.length,
            cumulativeTokens: 0,
            budgetTokens: 1_000_000,
            providerBudgetTokensRemaining: 1_000_000,
          },
        );

        expect(decision.allowed, snapshot.name).toBe(snapshot.expectedAllowed);
        expect(decision.reasons, snapshot.name).toEqual(snapshot.expectedReasons);
      }
    });

    it('keeps burst dispatch fixture edge cases explicit for queue-depth pauses', async () => {
      const fixture = readBurstDispatchLoadFixture();
      const edgeCase = fixture.edgeCases.find(testCase => testCase.name === 'queue-depth-stops-fresh-starts');

      expect(edgeCase).toBeDefined();
      const decision = await evaluateIssueBackpressure(
        { thresholds: edgeCase!.thresholds, signals: () => edgeCase!.signals },
        {
          issue: makeFixtureIssue(fixture.issues[0]!),
          index: 0,
          totalIssues: fixture.issues.length,
          pendingIssueCount: fixture.issues.length,
          cumulativeTokens: 0,
          budgetTokens: 1_000_000,
          providerBudgetTokensRemaining: 1_000_000,
        },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toEqual(edgeCase!.expectedReasons);
    });

    it('replays flaky liveness fixture snapshots into worker routing decisions', async () => {
      const fixture = readFlakyLivenessReplayFixture();
      const replayCases = [...fixture.snapshots, ...fixture.edgeCases];

      expect(fixture.description).toContain('Flaky liveness replay fixture');
      expect(fixture.issue.number).toBe(1806);
      expect(replayCases.map(testCase => testCase.name)).toEqual(expect.arrayContaining([
        'process-capacity-spike-defers-fresh-worker',
        'github-flake-resumes-checkpointed-worker',
        'recovered-liveness-starts-fresh-worker',
        'unconfigured-unrelated-dependency-does-not-pause-liveness',
      ]));

      for (const testCase of replayCases) {
        const decision = await evaluateIssueBackpressure(
          { thresholds: fixture.thresholds, signals: () => testCase.signals },
          {
            issue: makeFixtureIssue(fixture.issue),
            index: 0,
            totalIssues: 1,
            pendingIssueCount: 1,
            cumulativeTokens: 0,
            budgetTokens: 1_000_000,
            providerBudgetTokensRemaining: 1_000_000,
          },
        );
        const route = routeIssueWorkerForDegradedMode({
          issue: makeFixtureIssue(fixture.issue),
          checkpointHasIssueProgress: testCase.checkpointHasIssueProgress,
          graphHasCheckpointProgress: testCase.graphHasCheckpointProgress,
          backpressureDecision: decision,
          stopRemainingReason: testCase.stopRemainingReason,
        });

        expect(decision.allowed, testCase.name).toBe(testCase.expectedAllowed);
        expect(decision.reasons, testCase.name).toEqual(testCase.expectedReasons);
        expect(route, testCase.name).toMatchObject(testCase.expectedRoute);
      }
    });

    it('skips fresh issue starts when active process capacity is exhausted and explains the throttle', async () => {
      const logger = mockLogger();
      const issues = [makeIssue({ number: 11 })];
      const triages = [makeTriage(11)];
      const graphBuilder = mockGraphBuilder();
      const config = makeConfig({
        issues,
        triageResults: triages,
        logger,
        graphBuilder,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals: () => ({
            activeProcesses: 1,
            failedStarts: 0,
            inFlightBacklog: 0,
            oldestQueueAgeMs: 0,
          }),
        },
      });

      const outcomes = await runner.run(config);

      expect(mockRun).not.toHaveBeenCalled();
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(outcomes).toEqual([
        expect.objectContaining({
          issueNumber: 11,
          status: 'skipped',
          error: expect.stringContaining('backpressure: active processes 1 reached limit 1'),
        }),
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[issues] Backpressure paused issue #11'),
        expect.objectContaining({
          reasons: expect.arrayContaining(['active processes 1 reached limit 1']),
        }),
        'issues',
      );
    });

    it('blocks fresh ticket creation while in-flight backlog remains above threshold', async () => {
      const issues = [makeIssue({ number: 12 })];
      const triages = [makeTriage(12)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        backpressure: {
          thresholds: { maxInFlightBacklog: 1 },
          signals: () => ({
            activeProcesses: 0,
            failedStarts: 0,
            inFlightBacklog: 2,
            oldestQueueAgeMs: 5_000,
          }),
        },
      });

      const outcomes = await runner.run(config);

      expect(mockRun).not.toHaveBeenCalled();
      expect(outcomes[0]).toMatchObject({
        issueNumber: 12,
        status: 'skipped',
        error: expect.stringContaining('fresh ticket creation blocked while in-flight backlog 2 exceeds limit 1'),
      });
    });

    it('opens dependency-specific circuit breakers without blocking unrelated degraded dependencies', async () => {
      const decision = await evaluateIssueBackpressure(
        {
          thresholds: {
            dependencyCircuitBreakers: {
              github: { maxConsecutiveFailures: 3 },
            },
          },
          signals: () => ({
            activeProcesses: 0,
            failedStarts: 0,
            inFlightBacklog: 0,
            dependencyStatuses: [
              { dependency: 'github', status: 'degraded', consecutiveFailures: 3 },
              { dependency: 'grafana', status: 'unavailable', consecutiveFailures: 99 },
            ],
          }),
        },
        {
          issue: makeIssue({ number: 16 }),
          index: 0,
          totalIssues: 1,
          pendingIssueCount: 1,
          cumulativeTokens: 0,
          budgetTokens: 1_000_000,
          providerBudgetTokensRemaining: 1_000_000,
        },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toEqual([
        'github consecutive failures 3 reached circuit breaker limit 3',
      ]);
      expect(decision.dependencyCircuitBreakers).toEqual([
        expect.objectContaining({ dependency: 'github', status: 'degraded', state: 'open' }),
      ]);
    });

    it('honors explicit dependency open-until windows as an edge-case pause', async () => {
      const decision = await evaluateIssueBackpressure(
        {
          thresholds: {
            dependencyCircuitBreakers: {
              slack: { pauseOnStatuses: ['unavailable'] },
            },
          },
          signals: () => ({
            activeProcesses: 0,
            failedStarts: 0,
            inFlightBacklog: 0,
            dependencyStatuses: [
              { dependency: 'slack', status: 'healthy', openUntil: Date.now() + 60_000 },
            ],
          }),
        },
        {
          issue: makeIssue({ number: 17 }),
          index: 0,
          totalIssues: 1,
          pendingIssueCount: 1,
          cumulativeTokens: 0,
          budgetTokens: 1_000_000,
          providerBudgetTokensRemaining: 1_000_000,
        },
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reasons[0]).toContain('slack circuit breaker is open for another');
      expect(decision.dependencyCircuitBreakers[0]).toEqual(expect.objectContaining({
        dependency: 'slack',
        status: 'healthy',
        state: 'open',
        retryAfterMs: expect.any(Number),
      }));
    });

    it('recovers automatically when backpressure signals return to normal on the next issue', async () => {
      const snapshots = [
        { activeProcesses: 0, failedStarts: 3, inFlightBacklog: 0, oldestQueueAgeMs: 0 },
        { activeProcesses: 0, failedStarts: 0, inFlightBacklog: 0, oldestQueueAgeMs: 0 },
      ];
      const issues = [makeIssue({ number: 13 }), makeIssue({ number: 14 })];
      const triages = [makeTriage(13), makeTriage(14)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        backpressure: {
          thresholds: { maxFailedStarts: 1 },
          signals: () => snapshots.shift()!,
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 13, status: 'skipped' });
      expect(outcomes[0]!.error).toContain('failed starts 3 exceeds limit 1');
      expect(outcomes[1]).toMatchObject({ issueNumber: 14, status: 'fixed' });
      expect(mockRun).toHaveBeenCalledOnce();
    });

    it('emits live capacity watermark alerts without pausing fresh issue starts', async () => {
      const logger = mockLogger();
      const issues = [makeIssue({ number: 18 })];
      const triages = [makeTriage(18)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        logger,
        backpressure: {
          thresholds: { maxActiveProcesses: 10, capacityWatermarkRatio: 0.8 },
          signals: () => ({
            activeProcesses: 8,
            failedStarts: 0,
            inFlightBacklog: 0,
            oldestQueueAgeMs: 0,
          }),
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 18, status: 'fixed' });
      expect(mockRun).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[issues] Capacity watermark alert for issue #18'),
        expect.objectContaining({
          alerts: expect.arrayContaining([
            expect.objectContaining({
              signal: 'activeProcesses',
              value: 8,
              threshold: 10,
              watermarkRatio: 0.8,
              message: 'active processes 8 reached 80% of limit 10',
            }),
          ]),
        }),
        'issues',
      );
    });

    it('keeps capacity watermark alerts quiet below the configured watermark edge', async () => {
      const logger = mockLogger();
      const config = makeConfig({
        issues: [makeIssue({ number: 19 })],
        triageResults: [makeTriage(19)],
        logger,
        backpressure: {
          thresholds: { maxActiveProcesses: 10, capacityWatermarkRatio: 0.8 },
          signals: () => ({
            activeProcesses: 7,
            failedStarts: 0,
            inFlightBacklog: 0,
            oldestQueueAgeMs: 0,
          }),
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 19, status: 'fixed' });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('keeps capacity watermark alerts quiet when hard thresholds are zero', async () => {
      const logger = mockLogger();
      const config = makeConfig({
        issues: [makeIssue({ number: 20 })],
        triageResults: [makeTriage(20)],
        logger,
        backpressure: {
          thresholds: { maxInFlightBacklog: 0, capacityWatermarkRatio: 0.8 },
          signals: () => ({
            activeProcesses: 0,
            failedStarts: 0,
            inFlightBacklog: 0,
            oldestQueueAgeMs: 0,
          }),
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 20, status: 'fixed' });
      expect(mockRun).toHaveBeenCalledOnce();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('preserves one-shot checkpoint-complete outcomes before evaluating backpressure or blocker deferral', async () => {
      const checkpoint = mockCheckpoint(new Set([
        'impl:issue-15:done',
        'harden:issue-15:done',
        'impl:issue-15:commit:abc123',
        'harden:issue-15:last-commit:def456',
      ]));
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockReturnValue(checkpoint);
      vi.mocked(issueRuntime.artifactsForIssue).mockReturnValue({
        planName: 'issue-15',
        planDir: '.tmp/missing-one-shot-test-issue-15',
        checkpointFile: '.tmp/test-issue-15.checkpoint',
        logFile: '.tmp/test-issue-15.log',
      });
      const signals = vi.fn(() => ({
        activeProcesses: 1,
        failedStarts: 0,
        inFlightBacklog: 0,
        oldestQueueAgeMs: 0,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 15, labels: ['blocked'] })],
        triageResults: [makeTriage(15)],
        checkpoint,
        issueRuntime,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals,
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 15, status: 'fixed' });
      expect(signals).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('does not mark missing-plan chunked issueRuntime checkpoints complete from one finished chunk', async () => {
      const logger = mockLogger();
      const graphBuilder = mockGraphBuilder();
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockReturnValue(mockCheckpoint(new Set([
        'impl:01_issue-17:done',
        'harden:01_issue-17:done',
      ])));
      vi.mocked(issueRuntime.artifactsForIssue).mockReturnValue({
        planName: 'issue-17',
        planDir: '.tmp/missing-test-issue-17',
        checkpointFile: '.tmp/test-issue-17.checkpoint',
        logFile: '.tmp/test-issue-17.log',
      });
      const config = makeConfig({
        issues: [makeIssue({ number: 17, labels: ['blocked'] })],
        triageResults: [makeTriage(17, 'chunked')],
        graphBuilder,
        issueRuntime,
        logger,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 17,
        status: 'skipped',
        error: expect.stringContaining('deferred by scheduler: blocked issue'),
      });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('does not mark missing-plan issueRuntime checkpoints complete from chunk-file one-shot entries', async () => {
      const logger = mockLogger();
      const graphBuilder = mockGraphBuilder();
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockReturnValue(mockCheckpoint(new Set([
        'impl:01_issue-17:done',
        'harden:01_issue-17:done',
      ])));
      vi.mocked(issueRuntime.artifactsForIssue).mockReturnValue({
        planName: 'issue-17',
        planDir: '.tmp/missing-test-issue-17',
        checkpointFile: '.tmp/test-issue-17.checkpoint',
        logFile: '.tmp/test-issue-17.log',
      });
      const config = makeConfig({
        issues: [makeIssue({ number: 17, labels: ['blocked'] })],
        triageResults: [makeTriage(17)],
        graphBuilder,
        issueRuntime,
        logger,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 17,
        status: 'skipped',
        tokensUsed: 0,
        error: expect.stringContaining('deferred by scheduler: blocked issue'),
      });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('preserves shared-checkpoint completions before evaluating backpressure or blocker deferral', async () => {
      const logger = mockLogger();
      const checkpoint = mockCheckpoint(new Set(['impl:issue-15:done', 'harden:issue-15:done']));
      const signals = vi.fn(() => ({
        activeProcesses: 1,
        failedStarts: 0,
        inFlightBacklog: 0,
        oldestQueueAgeMs: 0,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 15, labels: ['blocked'] })],
        triageResults: [makeTriage(15)],
        checkpoint,
        logger,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals,
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 15, status: 'fixed' });
      expect(logger.warn).not.toHaveBeenCalled();
      expect(signals).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('recognizes issue-scoped shared-checkpoint progress from existing arbitrary chunk plans before pausing', async () => {
      writePlanChunks('issue-9915', ['checkpointed-api', 'checkpointed-ui']);
      const checkpoint = mockCheckpoint(new Set([
        'issue:9915:impl:01_checkpointed-api',
        'issue:9915:harden:01_checkpointed-api',
        'impl:01_checkpointed-api:done',
        'harden:01_checkpointed-api:done',
      ]));
      const graphBuilder = mockGraphBuilder();
      const signals = vi.fn(() => ({
        activeProcesses: 1,
        failedStarts: 0,
        inFlightBacklog: 0,
        oldestQueueAgeMs: 0,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 9915 })],
        triageResults: [makeTriage(9915, 'chunked')],
        checkpoint,
        graphBuilder,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals,
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 9915, status: 'fixed' });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(signals).not.toHaveBeenCalled();
      expect(checkpoint.write).not.toHaveBeenCalledWith('issue:9915:impl:01_checkpointed-api');
      expect(checkpoint.write).not.toHaveBeenCalledWith('issue:9915:harden:01_checkpointed-api');
      expect(mockRun).toHaveBeenCalledOnce();
    });

    it('does not treat partial legacy shared checkpoint entries as progress for fresh starts', async () => {
      writePlanChunks('issue-15', ['api', 'ui']);
      const checkpoint = mockCheckpoint(new Set(['impl:01_api:done', 'harden:01_api:done']));
      const graphBuilder = mockGraphBuilder();
      const config = makeConfig({
        issues: [makeIssue({ number: 15 })],
        triageResults: [makeTriage(15)],
        checkpoint,
        graphBuilder,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals: () => ({
            activeProcesses: 1,
            failedStarts: 0,
            inFlightBacklog: 0,
            oldestQueueAgeMs: 0,
          }),
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 15, status: 'skipped' });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('recognizes completed legacy shared-checkpoint chunk plans before pausing', async () => {
      writePlanChunks('issue-9917', ['legacy-api']);
      const checkpoint = mockCheckpoint(new Set([
        'impl:01_legacy-api:done',
        'harden:01_legacy-api:done',
      ]));
      const graphBuilder = mockGraphBuilder();
      const signals = vi.fn(() => ({
        activeProcesses: 1,
        failedStarts: 0,
        inFlightBacklog: 0,
        oldestQueueAgeMs: 0,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 9917 })],
        triageResults: [makeTriage(9917, 'chunked')],
        checkpoint,
        graphBuilder,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals,
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 9917, status: 'fixed' });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(signals).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('resumes issue-scoped shared-checkpoint commit recovery under backpressure', async () => {
      writePlanChunks('issue-9916', ['checkpointed-api']);
      const checkpoint = {
        ...mockCheckpoint(new Set(['issue:9916:impl:01_checkpointed-api'])),
        lastCommit: vi.fn((taskId: string, stage: string) =>
          taskId === 'impl:01_checkpointed-api' && stage === 'impl' ? 'abc123' : undefined,
        ),
      };
      const signals = vi.fn(() => ({
        activeProcesses: 1,
        failedStarts: 0,
        inFlightBacklog: 0,
        oldestQueueAgeMs: 0,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 9916 })],
        triageResults: [makeTriage(9916, 'chunked')],
        checkpoint,
        backpressure: {
          thresholds: { maxActiveProcesses: 1 },
          signals,
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 9916, status: 'fixed' });
      expect(signals).not.toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalledOnce();
    });

    it('stops iteration after queue depth backpressure to avoid priority inversion', async () => {
      const logger = mockLogger();
      const graphBuilder = mockGraphBuilder();
      const config = makeConfig({
        issues: [makeIssue({ number: 16 }), makeIssue({ number: 17 })],
        triageResults: [makeTriage(16), makeTriage(17)],
        graphBuilder,
        logger,
        backpressure: {
          thresholds: { maxPendingIssueCount: 1 },
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toEqual([
        expect.objectContaining({
          issueNumber: 16,
          status: 'skipped',
          error: expect.stringContaining('queue depth 2 exceeds limit 1'),
        }),
        expect.objectContaining({
          issueNumber: 17,
          status: 'skipped',
          tokensUsed: 0,
          error: expect.stringContaining('queue depth 2 exceeds limit 1'),
        }),
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[issues] Degraded-mode route for issue #17: defer-fresh-start'),
        expect.objectContaining({
          workerRoute: expect.objectContaining({
            action: 'defer-fresh-start',
            issueNumber: 17,
            reason: expect.stringContaining('queue depth 2 exceeds limit 1'),
          }),
        }),
        'issues',
      );
      expect(mockRun).not.toHaveBeenCalled();
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
    });



    it('classifies priority labels used by the urgent default issue fetch', () => {
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 81, labels: ['priority:critical'] })).priority).toBe('critical');
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 82, labels: ['priority:high'] })).priority).toBe('high');
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 83, labels: ['priority:medium'] })).priority).toBe('medium');
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 84, labels: ['priority:low'] })).priority).toBe('low');
    });

    it('treats status-prefixed blocked labels as scheduler gates', () => {
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 71, labels: ['status:blocked'] })).blockerStatus).toBe('blocked');
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 72, labels: ['status:paused'] })).blockerStatus).toBe('blocked');
      expect(evaluateIssueSchedulingScore(makeIssue({ number: 73, labels: ['status:needs-input'] })).blockerStatus).toBe('hitl');
    });

    it('excludes blocked and HITL cards from queue-depth backpressure counts', async () => {
      const config = makeConfig({
        issues: [
          makeIssue({ number: 16 }),
          makeIssue({ number: 17, labels: ['blocked'] }),
          makeIssue({ number: 18, labels: ['hitl'] }),
        ],
        triageResults: [makeTriage(16), makeTriage(17), makeTriage(18)],
        backpressure: {
          thresholds: { maxPendingIssueCount: 1 },
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toEqual([
        expect.objectContaining({ issueNumber: 16, status: 'fixed' }),
        expect.objectContaining({
          issueNumber: 17,
          status: 'skipped',
          error: expect.stringContaining('deferred by scheduler: blocked issue'),
        }),
        expect.objectContaining({
          issueNumber: 18,
          status: 'skipped',
          error: expect.stringContaining('deferred by scheduler: hitl issue'),
        }),
      ]);
      expect(mockRun).toHaveBeenCalledOnce();
    });

    it('logs a defer route when queue-depth degradation reaches issue-scoped checkpoint metadata without graph progress', async () => {
      const logger = mockLogger();
      writePlanChunks('issue-17', ['api']);
      const checkpoint = mockCheckpoint(new Set(['issue-17-metadata-only']));
      const config = makeConfig({
        issues: [makeIssue({ number: 16 }), makeIssue({ number: 17 })],
        triageResults: [makeTriage(16), makeTriage(17, 'chunked')],
        checkpoint,
        logger,
        backpressure: {
          thresholds: { maxPendingIssueCount: 1 },
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[1]).toMatchObject({
        issueNumber: 17,
        status: 'skipped',
        error: expect.stringContaining('queue depth 2 exceeds limit 1'),
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[issues] Degraded-mode route for issue #17: defer-fresh-start'),
        expect.objectContaining({
          workerRoute: expect.objectContaining({
            action: 'defer-fresh-start',
            checkpointHasIssueProgress: true,
            graphHasCheckpointProgress: false,
            graphComplete: false,
          }),
        }),
        'issues',
      );
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('resumes partially checkpointed issueRuntime work after queue-depth stops fresh starts', async () => {
      const logger = mockLogger();
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockImplementation((issueNumber: number) =>
        issueNumber === 17 ? mockCheckpoint(new Set(['impl:01_issue-17:done'])) : mockCheckpoint(),
      );
      vi.mocked(issueRuntime.artifactsForIssue).mockImplementation((issueNumber: number): IssueRuntimeArtifacts => ({
        planName: `issue-${issueNumber}`,
        planDir: `.tmp/test-issue-${issueNumber}`,
        checkpointFile: `.tmp/test-issue-${issueNumber}.checkpoint`,
        logFile: `.tmp/test-issue-${issueNumber}.log`,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 16 }), makeIssue({ number: 17 })],
        triageResults: [makeTriage(16), makeTriage(17)],
        issueRuntime,
        logger,
        backpressure: {
          thresholds: { maxPendingIssueCount: 1 },
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 16, status: 'skipped' });
      expect(outcomes[1]).toMatchObject({ issueNumber: 17, status: 'fixed' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[issues] Degraded-mode route for issue #17: resume-checkpointed'),
        expect.objectContaining({
          workerRoute: expect.objectContaining({
            action: 'resume-checkpointed',
            checkpointHasIssueProgress: true,
            graphHasCheckpointProgress: true,
            reason: expect.stringContaining('queue depth 2 exceeds limit 1'),
          }),
        }),
        'issues',
      );
      expect(mockRun).toHaveBeenCalledOnce();
    });


    it('rejects completed one-shot issueRuntime checkpoint chunk ids after plan cleanup', async () => {
      const logger = mockLogger();
      const graphBuilder = mockGraphBuilder();
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockReturnValue(mockCheckpoint(new Set([
        'impl:01_issue-17:done',
        'harden:01_issue-17:done',
        'commit:impl:01_issue-17:abc123',
      ])));
      vi.mocked(issueRuntime.artifactsForIssue).mockReturnValue({
        planName: 'issue-17',
        planDir: '.tmp/test-issue-17-missing-plan',
        checkpointFile: '.tmp/test-issue-17.checkpoint',
        logFile: '.tmp/test-issue-17.log',
      });
      const config = makeConfig({
        issues: [makeIssue({ number: 17, labels: ['status:blocked'] })],
        triageResults: [makeTriage(17)],
        graphBuilder,
        issueRuntime,
        logger,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 17,
        status: 'skipped',
        tokensUsed: 0,
        error: expect.stringContaining('deferred by scheduler: blocked issue'),
      });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });


    it('rejects shared-checkpoint one-shot chunk ids before blocked deferral', async () => {
      const graphBuilder = mockGraphBuilder();
      const checkpoint = mockCheckpoint(new Set([
        'impl:01_issue-17:done',
        'harden:01_issue-17:done',
      ]));
      const config = makeConfig({
        issues: [makeIssue({ number: 17, labels: ['blocked'] })],
        triageResults: [makeTriage(17)],
        graphBuilder,
        checkpoint,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 17,
        status: 'skipped',
        tokensUsed: 0,
        error: expect.stringContaining('deferred by scheduler: blocked issue'),
      });
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('defers partially checkpointed blocked issueRuntime work until the gate clears', async () => {
      const logger = mockLogger();
      const graphBuilder = mockGraphBuilder();
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockReturnValue(mockCheckpoint(new Set(['impl:01_issue-17:done'])));
      vi.mocked(issueRuntime.artifactsForIssue).mockReturnValue({
        planName: 'issue-17',
        planDir: '.tmp/test-issue-17',
        checkpointFile: '.tmp/test-issue-17.checkpoint',
        logFile: '.tmp/test-issue-17.log',
      });
      const config = makeConfig({
        issues: [makeIssue({ number: 17, labels: ['blocked'] })],
        triageResults: [makeTriage(17)],
        graphBuilder,
        issueRuntime,
        logger,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 17,
        status: 'skipped',
        error: expect.stringContaining('deferred by scheduler: blocked issue'),
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[issues] Deferred issue #17: deferred by scheduler: blocked issue'),
        expect.objectContaining({
          schedulingScore: expect.objectContaining({ blockerStatus: 'blocked' }),
        }),
        'issues',
      );
      expect(graphBuilder.buildChunkDefinitionsForIssue).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('contains issue-runtime checkpoint read failures to one issue outcome', async () => {
      const throwingCheckpoint = {
        ...mockCheckpoint(),
        readAll: vi.fn(() => {
          throw new Error('checkpoint unreadable');
        }),
      };
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockImplementation((issueNumber: number) =>
        issueNumber === 21 ? throwingCheckpoint : mockCheckpoint(),
      );
      vi.mocked(issueRuntime.artifactsForIssue).mockImplementation((issueNumber: number): IssueRuntimeArtifacts => ({
        planName: `issue-${issueNumber}`,
        planDir: `.tmp/test-issue-${issueNumber}`,
        checkpointFile: `.tmp/test-issue-${issueNumber}.checkpoint`,
        logFile: `.tmp/test-issue-${issueNumber}.log`,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 21 }), makeIssue({ number: 22 })],
        triageResults: [makeTriage(21), makeTriage(22)],
        issueRuntime,
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 21,
        status: 'failed',
        error: 'checkpoint unreadable',
      });
      expect(outcomes[1]).toMatchObject({ issueNumber: 22, status: 'fixed' });
      expect(mockRun).toHaveBeenCalledOnce();
    });

    it('contains failing signal sources to a failed issue outcome', async () => {
      const config = makeConfig({
        issues: [makeIssue({ number: 18 }), makeIssue({ number: 19 })],
        triageResults: [makeTriage(18), makeTriage(19)],
        backpressure: {
          signals: vi
            .fn()
            .mockRejectedValueOnce(new Error('metrics unavailable'))
            .mockResolvedValue({
              activeProcesses: 0,
              failedStarts: 0,
              inFlightBacklog: 0,
              oldestQueueAgeMs: 0,
            }),
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 18,
        status: 'failed',
        error: 'metrics unavailable',
      });
      expect(outcomes[1]).toMatchObject({ issueNumber: 19, status: 'fixed' });
      expect(mockRun).toHaveBeenCalledOnce();
    });
  });

  describe('checkpoint integration', () => {
    it('skips issues where all tasks already checkpointed', async () => {
      const checkpoint = mockCheckpoint(
        new Set(['impl:01_issue-1:done', 'harden:01_issue-1:done']),
      );
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triages = [makeTriage(1), makeTriage(2)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        checkpoint,
        logger: mockLogger(),
      });

      const outcomes = await runner.run(config);

      expect(outcomes).toHaveLength(2);
      // Issue 1 should be skipped (already completed via checkpoint)
      expect(outcomes.find(o => o.issueNumber === 1)!.status).toBe('fixed');
      // Issue 2 should be executed
      expect(mockRun).toHaveBeenCalledOnce();
    });
  });

  describe('outcome shape', () => {
    it('returns IssueOutcome with correct fields on success', async () => {
      const issues = [makeIssue({ number: 42, title: 'Fix the thing' })];
      const triages = [makeTriage(42)];
      const config = makeConfig({
        issues,
        triageResults: triages,
        fullDeps: {
          prCreator: {
            create: vi.fn(async () => ({ url: 'https://github.com/org/repo/pull/42' })),
          },
        } as unknown as BeastLoopDeps,
      });

      const outcomes = await runner.run(config);

      const outcome = outcomes[0]!;
      expect(outcome.issueNumber).toBe(42);
      expect(outcome.issueTitle).toBe('Fix the thing');
      expect(outcome.status).toBe('fixed');
      expect(outcome.tokensUsed).toBe(200);
      expect(outcome.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(outcome.error).toBeUndefined();
    });

    it('propagates BeastResult errors into failed IssueOutcome summaries', async () => {
      mockRun.mockResolvedValueOnce({
        status: 'failed',
        tokenSpend: { totalTokens: 123 },
        taskResults: [{ taskId: 'impl:dummy', status: 'success' }],
        error: new Error('PR not created: run `gh auth login`; branch feature/auth-warning is pushed.'),
      } as unknown as BeastResult);
      const issues = [makeIssue({ number: 746, title: 'Fix PR auth warning' })];
      const triages = [makeTriage(746)];
      const config = makeConfig({ issues, triageResults: triages });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({
        issueNumber: 746,
        status: 'failed',
        tokensUsed: 123,
        error: 'PR not created: run `gh auth login`; branch feature/auth-warning is pushed.',
      });
    });
  });
});
