import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IssueRunner, evaluateIssueBackpressure, buildIssueSchedulerFairnessReport, routeIssueWorkerForDegradedMode } from '../../../src/issues/issue-runner.js';
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

function readBurstDispatchLoadFixture(): BurstDispatchLoadFixture {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'burst-dispatch-load.json'), 'utf8'),
  ) as BurstDispatchLoadFixture;
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

      expect(report).toEqual({
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
            issue: makeIssue(fixture.issues[0]!),
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
          issue: makeIssue(fixture.issues[0]!),
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

    it('preserves checkpoint-complete outcomes before evaluating backpressure', async () => {
      const checkpoint = mockCheckpoint(new Set(['impl:01_issue-15:done', 'harden:01_issue-15:done']));
      const issueRuntime = makeIssueRuntimeSupport();
      vi.mocked(issueRuntime.checkpointForIssue).mockReturnValue(checkpoint);
      vi.mocked(issueRuntime.artifactsForIssue).mockReturnValue({
        planName: 'issue-15',
        planDir: '.tmp/test-issue-15',
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
        issues: [makeIssue({ number: 15 })],
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

    it('preserves shared-checkpoint completions before evaluating backpressure', async () => {
      const checkpoint = mockCheckpoint(new Set(['impl:01_issue-15:done', 'harden:01_issue-15:done']));
      const signals = vi.fn(() => ({
        activeProcesses: 1,
        failedStarts: 0,
        inFlightBacklog: 0,
        oldestQueueAgeMs: 0,
      }));
      const config = makeConfig({
        issues: [makeIssue({ number: 15 })],
        triageResults: [makeTriage(15)],
        checkpoint,
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
        backpressure: {
          thresholds: { maxPendingIssueCount: 1 },
        },
      });

      const outcomes = await runner.run(config);

      expect(outcomes[0]).toMatchObject({ issueNumber: 16, status: 'skipped' });
      expect(outcomes[1]).toMatchObject({ issueNumber: 17, status: 'fixed' });
      expect(mockRun).toHaveBeenCalledOnce();
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
