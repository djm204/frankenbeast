import { describe, it, expect, vi } from 'vitest';
import { LessonRecorder } from '../../../src/memory/lesson-recorder.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../../../src/types/evaluation.js';
import type { MemoryPort } from '../../../src/types/contracts.js';
import type {
  CritiqueLoopResult,
  CritiqueIteration,
} from '../../../src/types/loop.js';
import type {
  CritiqueResult,
  EvaluationFinding,
} from '../../../src/types/evaluation.js';

function createMockMemoryPort(): MemoryPort {
  return {
    searchADRs: vi.fn().mockResolvedValue([]),
    searchEpisodic: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function createIteration(
  index: number,
  verdict: 'pass' | 'warn' | 'fail',
  evaluatorName = 'mock',
  findings: EvaluationFinding[] = [],
): CritiqueIteration {
  const result: CritiqueResult = {
    verdict,
    overallScore: verdict === 'pass' ? 1 : 0.3,
    results: [
      {
        evaluatorName,
        verdict,
        score: verdict === 'pass' ? 1 : 0.3,
        findings,
      },
    ],
    shortCircuited: false,
  };
  return {
    index,
    input: { content: `iteration ${index}`, metadata: {} },
    result,
    completedAt: new Date().toISOString(),
  };
}

describe('LessonRecorder', () => {
  it('does not record when critique passes on first iteration', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [createIteration(0, 'pass')],
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('records a lesson when multi-iteration pass occurs (fail then pass)', async () => {
    const unsafeDynamicCallName = 'executeUntrustedCode';

    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'safety', [
          {
            message: `${unsafeDynamicCallName}() detected`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(port.recordLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatorName: 'safety',
        failureDescription: expect.stringContaining(
          `${unsafeDynamicCallName}()`,
        ),
        taskId: 'test-task',
      }),
    );
  });

  it('adds a deterministic lesson-to-test traceability map to recorded lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'Safety Gate', [
          { message: 'plain HTTP endpoint needs HTTPS', severity: 'critical' },
        ]),
        createIteration(2, 'pass'),
      ],
    };

    await recorder.record(result, 'Task 123');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.testTraceability).toEqual([
      {
        lessonId: 'task-123:safety-gate:iteration-0',
        taskId: 'Task 123',
        evaluatorName: 'Safety Gate',
        failingIteration: 0,
        resolvedIteration: 2,
        sourceFindingMessages: ['plain HTTP endpoint needs HTTPS'],
        testId: 'task-123:safety-gate:iteration-0:regression',
        verificationCommand:
          'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      },
    ]);
  });

  it('captures reviewer feedback messages, suggestions, severities, and source locations with the lesson', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR summary omits the verification command',
            severity: 'warning',
            location: 'pull-request-body',
            suggestion:
              'Add the exact targeted test command and result to the PR description.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'review-feedback-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.reviewerFeedback).toEqual({
      summary: 'PR summary omits the verification command',
      findings: [
        {
          sourceIteration: 0,
          evaluatorName: 'reviewer',
          message: 'PR summary omits the verification command',
          severity: 'warning',
          location: 'pull-request-body',
          suggestion:
            'Add the exact targeted test command and result to the PR description.',
        },
      ],
      suggestionsComplete: true,
    });
  });

  it('marks reviewer-feedback lessons with missing suggestions for PM follow-up', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Review identified a handoff gap without remediation guidance',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'missing-suggestion-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.reviewerFeedback).toEqual({
      summary: 'Review identified a handoff gap without remediation guidance',
      findings: [
        {
          sourceIteration: 0,
          evaluatorName: 'reviewer',
          message:
            'Review identified a handoff gap without remediation guidance',
          severity: 'critical',
        },
      ],
      suggestionsComplete: false,
      missingSuggestionGuidance:
        'Reviewer feedback did not include suggestions for every finding; PM handoffs should preserve the original message and ask a reviewer to attach remediation guidance before promotion.',
    });
  });

  it('attaches a deterministic per-agent improvement scorecard to recorded lessons when an agent id is configured', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      agentId: 'worker-alpha',
      now: (): string => '2026-07-12T00:00:00.000Z',
    });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'quality-gate', [
          {
            message: 'PR handoff omitted verification evidence',
            severity: 'warning',
            suggestion: 'Add the targeted test command and result.',
          },
          {
            message: 'Reviewer blocker was left unresolved',
            severity: 'critical',
            suggestion: 'Resolve the review thread before merge.',
          },
        ]),
        createIteration(1, 'fail', 'quality-gate', [
          {
            message: 'Verification evidence is present but incomplete',
            severity: 'warning',
          },
        ]),
        createIteration(2, 'pass'),
      ],
    };

    await recorder.record(result, 'scorecard-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.agentImprovementScorecard).toEqual({
      schemaVersion: 'agent-improvement-scorecard-v1',
      agentId: 'worker-alpha',
      taskId: 'scorecard-task',
      evaluatorName: 'quality-gate',
      generatedAt: '2026-07-12T00:00:00.000Z',
      initialScore: 0.3,
      finalScore: 1,
      scoreDelta: 0.7,
      failingIterations: [0, 1],
      resolvedIteration: 2,
      findingCounts: {
        critical: 1,
        warning: 2,
        info: 0,
        total: 3,
      },
      improvementSignals: [
        'Recovered from 2 failing critique iterations before pass.',
        'Improved quality-gate score by 0.7.',
        'Resolved 1 critical blocker finding.',
      ],
      guidance:
        'Use this per-agent scorecard in worker retrospectives and PM handoff summaries to compare improvement over time without parsing free-form lesson prose.',
    });
  });

  it('rejects blank per-agent scorecard ids so PM summaries do not group lessons under an ambiguous agent', () => {
    expect(
      () => new LessonRecorder(createMockMemoryPort(), { agentId: '  ' }),
    ).toThrow('LessonRecorder agentId must be a non-empty string when provided.');
  });

  it('attaches an LLM-friendly post-PR lesson extraction template to recorded lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR omitted the regression evidence from the handoff',
            severity: 'warning',
            suggestion:
              'Add the exact verifier command and result before requesting promotion.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'post-pr-template-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.postPrLessonExtractionTemplate).toEqual({
      templateId: 'post-pr-lesson-extraction-v1',
      trigger: 'after-pr-review-or-merge',
      instructions: [
        'Inspect the linked issue, PR description, final diff, reviewer feedback, and verification evidence before extracting a durable lesson.',
        'Extract only lessons that are reusable for future workers; do not restate one-off implementation details as policy.',
        'If required evidence is missing, set followUpNeeded to true and use insufficientEvidenceGuidance instead of inventing a lesson.',
      ],
      requiredEvidence: [
        'Linked issue or task identifier',
        'PR URL or merge/review artifact',
        'Reviewer finding or failure mode that motivated the correction',
        'Correction applied in the final PR head',
        'Regression test, verifier, or explicit reason no code-level regression applies',
      ],
      outputSchema: {
        issueNumber: 'number-or-null',
        prUrl: 'string-or-null',
        sourceFinding: 'string',
        correctionApplied: 'string',
        reusableLesson: 'string',
        regressionEvidence: 'string',
        followUpNeeded: 'boolean',
      },
      insufficientEvidenceGuidance:
        'Do not promote a post-PR lesson until the issue/PR, source finding, correction, and verification evidence are all available.',
    });
  });

  it('does not attach a post-PR extraction template when no actionable lesson is recorded', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'internal evaluator error occurred',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'post-pr-template-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('sandboxes new lessons as experimental and blocks promotion until verified', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          {
            message: 'handoff cited an unverified file path',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'sandbox-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.experimentSandbox).toEqual({
      state: 'experimental',
      promotionBlocked: true,
      reason:
        'New critique lessons are experimental until their traceability map and regression evidence are independently verified.',
      exitCriteria: [
        'Confirm at least one lesson-to-test traceability entry is present.',
        'Run the listed verification command and attach the evidence to the PM handoff.',
        'Promote or retire the lesson only after review confirms the regression covers the source finding.',
      ],
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
    });
  });

  it('attaches a deterministic lesson rollback workflow to recorded lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'lesson overgeneralized a one-off reviewer preference',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'rollback-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.rollbackWorkflow).toEqual({
      workflowId: 'lesson-rollback-v1',
      eligibleStates: ['experimental', 'promoted'],
      steps: [
        'Quarantine the target lesson so PM/liveness tooling stops promoting it into new handoffs.',
        'Attach the rollback reason, evidence URLs, and verifier command to the lesson audit trail.',
        'Either record a replacement lesson with fresh traceability evidence or mark the original lesson retired with no replacement.',
        'Run the verifier command and include the result in the PM handoff before removing the rollback block.',
      ],
      requiredEvidence: [
        'Stable lesson identifier or traceability entry',
        'Reason the lesson is incorrect, stale, over-broad, or harmful',
        'Review comment, failed regression, operator report, or incident link proving rollback is warranted',
        'Verification command for the replacement lesson or retired state',
      ],
      requestSchema: {
        lessonId: 'string',
        rollbackReason: 'string',
        evidenceUrls: 'string[]',
        replacementLesson: 'string-or-null',
        verificationCommand: 'string',
      },
      insufficientEvidenceGuidance:
        'Do not roll back a lesson unless the rollback request names the lesson, explains the bad/stale guidance, links review or regression evidence, and includes a verification command for the replacement or retirement decision.',
    });
  });

  it('does not attach rollback workflow guidance when no actionable lesson is recorded', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message:
              'rollback guidance should not attach to evaluator exceptions',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'rollback-exception-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('attaches learning cooldown metadata to recorded lessons for PM/liveness tooling', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Lesson was promoted without verification evidence',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const summary = await recorder.record(result, 'cooldown-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(summary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(lesson.cooldown).toEqual({
      key: expect.stringMatching(/^critique-lesson:learning-reviewer:/),
      windowMs: 60_000,
      recordedAt: '2026-07-12T10:00:00.000Z',
      suppressUntil: '2026-07-12T10:01:00.000Z',
      guidance:
        'Equivalent critique lessons are suppressed during this cooldown window so PM/liveness tooling does not churn on repeated feedback before promotion or retirement review.',
    });
    expect(lesson.timestamp).toBe('2026-07-12T10:00:00.000Z');
  });

  it('suppresses equivalent lessons inside the cooldown window and returns structured evidence', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Repeated PM handoff lesson caused churn',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'first-task');
    now = new Date('2026-07-12T10:00:30.000Z');
    const suppressed = await recorder.record(result, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(suppressed.recorded).toBe(0);
    expect(suppressed.suppressedByCooldown).toEqual([
      {
        key: expect.stringMatching(/^critique-lesson:learning-reviewer:/),
        taskId: 'second-task',
        evaluatorName: 'learning-reviewer',
        suppressedAt: '2026-07-12T10:00:30.000Z',
        suppressUntil: '2026-07-12T10:01:00.000Z',
        remainingMs: 30_000,
        reason:
          'Equivalent critique lesson is still inside the learning cooldown window; reuse the existing lesson metadata instead of recording another copy.',
      },
    ]);
  });

  it('records equivalent lessons again after the cooldown expires', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Cooldown edge should expire deterministically',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'first-task');
    now = new Date('2026-07-12T10:01:00.001Z');
    const admitted = await recorder.record(result, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(admitted).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('honors shared cooldown state across recorder instances', async () => {
    const port = createMockMemoryPort();
    const cooldownStore = new Map<string, number>();
    const firstRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const secondRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:30.000Z'),
      cooldownStore,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Reviewer rebuild should keep cooldown state',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await firstRecorder.record(result, 'first-task');
    const suppressed = await secondRecorder.record(result, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(suppressed).toEqual({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({
          taskId: 'second-task',
          remainingMs: 30_000,
        }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('shares pending admissions when recorder instances reuse a cooldown store', async () => {
    const port = createMockMemoryPort();
    const cooldownStore = new Map<string, number>();
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () =>
          new Promise<void>((release) => {
            releasePersistence = release;
            resolve();
          }),
      );
    });
    const firstRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const secondRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message:
              'Concurrent shared reviewer rebuild should suppress duplicates',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = firstRecorder.record(result, 'first-task');
    await persistenceStarted;
    const secondRecord = secondRecorder.record(result, 'second-task');
    releasePersistence();
    const [firstSummary, secondSummary] = await Promise.all([
      firstRecord,
      secondRecord,
    ]);

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(firstSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({ taskId: 'second-task' }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('honors cooldownMs 0 even when a cooldown store is reused', async () => {
    const port = createMockMemoryPort();
    const cooldownStore = new Map<string, number>();
    const enabledRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const disabledRecorder = new LessonRecorder(port, {
      cooldownMs: 0,
      now: (): Date => new Date('2026-07-12T10:00:30.000Z'),
      cooldownStore,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Disabled cooldown should not reuse shared suppression',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await enabledRecorder.record(result, 'first-task');
    const disabledSummary = await disabledRecorder.record(
      result,
      'second-task',
    );

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(disabledSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('aligns local suppression with the recorded cooldown metadata', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () =>
          new Promise<void>((release) => {
            releasePersistence = release;
            resolve();
          }),
      );
    });
    const recorder = new LessonRecorder(port, {
      cooldownMs: 1_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message:
              'Slow memory writes should keep recorded and live cooldowns aligned',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'first-task');
    await persistenceStarted;
    now = new Date('2026-07-12T10:00:02.000Z');
    releasePersistence();
    await firstRecord;
    const secondSummary = await recorder.record(result, 'second-task');
    const firstLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      cooldown: { recordedAt: string; suppressUntil: string };
    };

    expect(firstLesson.cooldown.recordedAt).toBe('2026-07-12T10:00:00.000Z');
    expect(firstLesson.cooldown.suppressUntil).toBe('2026-07-12T10:00:01.000Z');
    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('reserves cooldown admission before async persistence completes', async () => {
    const port = createMockMemoryPort();
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise<void>((release) => {
            releasePersistence = release;
            resolve();
          }),
      );
    });
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Concurrent review should not double-record',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'first-task');
    await persistenceStarted;
    const secondRecord = recorder.record(result, 'second-task');
    releasePersistence();
    const [firstSummary, secondSummary] = await Promise.all([
      firstRecord,
      secondRecord,
    ]);

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(firstSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({
          taskId: 'second-task',
          evaluatorName: 'learning-reviewer',
          remainingMs: 60_000,
        }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('does not suppress a concurrent duplicate when the admitting persistence fails', async () => {
    const port = createMockMemoryPort();
    let rejectFirstPersistence!: (error: Error) => void;
    const firstPersistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(
          () =>
            new Promise<void>((_release, reject) => {
              rejectFirstPersistence = reject;
              resolve();
            }),
        )
        .mockResolvedValue(undefined);
    });
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Retry should persist if first store write fails',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'first-task');
    await firstPersistenceStarted;
    const secondRecord = recorder.record(result, 'second-task');
    const thirdRecord = recorder.record(result, 'third-task');
    rejectFirstPersistence(new Error('transient store failure'));
    const [firstSummary, secondSummary, thirdSummary] = await Promise.all([
      firstRecord,
      secondRecord,
      thirdRecord,
    ]);

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(firstSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(thirdSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({
          taskId: 'third-task',
          evaluatorName: 'learning-reviewer',
        }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('keeps multiline finding boundaries distinct in cooldown keys', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const multilineFinding: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          { message: 'a\nb', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };
    const separateFindings: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          { message: 'a', severity: 'warning' },
          { message: 'b', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(multilineFinding, 'first-task');
    const secondSummary = await recorder.record(
      separateFindings,
      'second-task',
    );

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('keeps evaluator names distinct even when their display slugs collide', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const policySpace: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'policy A', [
          { message: 'same finding', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };
    const policyDash: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'policy-A', [
          { message: 'same finding', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(policySpace, 'first-task');
    const secondSummary = await recorder.record(policyDash, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('mines cross-task blocker patterns after equivalent critical findings recur across distinct tasks', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Codex usage-limit blocker stopped the current-head review gate',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstSummary = await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:05:00.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    const secondLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    expect(firstSummary.minedBlockerPatterns).toEqual([]);
    expect(secondSummary.minedBlockerPatterns).toEqual([
      {
        key: expect.stringMatching(/^blocker-pattern:codex-review:/),
        evaluatorName: 'codex-review',
        normalizedFinding:
          'codex usage-limit blocker stopped the current-head review gate',
        threshold: 2,
        occurrences: 2,
        taskIds: ['task-a', 'task-b'],
        firstSeenAt: '2026-07-12T10:00:00.000Z',
        lastSeenAt: '2026-07-12T10:05:00.000Z',
        guidance:
          'Equivalent blocker findings have recurred across distinct tasks; PM/liveness handoffs should treat this as a cross-task pattern and route a durable mitigation instead of rediscovering it per task.',
      },
    ]);
    expect(secondLesson.blockerPatterns).toEqual(
      secondSummary.minedBlockerPatterns,
    );
  });

  it('persists a mined blocker pattern even when the equivalent lesson is inside cooldown', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      blockerPatternThreshold: 2,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Same current-head Codex review blocker should be routed durably',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:00:30.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    const secondLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary.recorded).toBe(1);
    expect(secondSummary.suppressedByCooldown).toEqual([]);
    expect(secondSummary.minedBlockerPatterns).toHaveLength(1);
    expect(secondLesson.blockerPatterns).toEqual(
      secondSummary.minedBlockerPatterns,
    );
  });

  it('counts suppressed repeats and only bypasses cooldown on threshold crossing', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      blockerPatternThreshold: 3,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Suppressed repeat should still count toward blocker threshold',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:00:10.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    now = new Date('2026-07-12T10:00:20.000Z');
    const thirdSummary = await recorder.record(result, 'task-c');
    const thirdLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    expect(secondSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [expect.objectContaining({ taskId: 'task-b' })],
      minedBlockerPatterns: [],
    });
    expect(thirdSummary.recorded).toBe(1);
    expect(thirdSummary.suppressedByCooldown).toEqual([]);
    expect(thirdSummary.minedBlockerPatterns).toEqual([
      expect.objectContaining({
        occurrences: 3,
        taskIds: ['task-a', 'task-b', 'task-c'],
      }),
    ]);
    expect(thirdLesson.blockerPatterns).toEqual(
      thirdSummary.minedBlockerPatterns,
    );
  });

  it('serializes blocker mining by pattern key before committing observations', async () => {
    const port = createMockMemoryPort();
    const releaseRecordLesson: (() => void)[] = [];
    (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRecordLesson.push(resolve);
        }),
    );
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Concurrent blockers must not cross threshold without reporting',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'task-a');
    await Promise.resolve();
    expect(port.recordLesson).toHaveBeenCalledTimes(1);

    const secondRecord = recorder.record(result, 'task-b');
    await Promise.resolve();
    expect(port.recordLesson).toHaveBeenCalledTimes(1);

    releaseRecordLesson[0]!();
    const firstSummary = await firstRecord;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(firstSummary.minedBlockerPatterns).toEqual([]);
    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    const secondLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    releaseRecordLesson[1]!();
    const secondSummary = await secondRecord;

    expect(secondSummary.minedBlockerPatterns).toEqual([
      expect.objectContaining({
        occurrences: 2,
        taskIds: ['task-a', 'task-b'],
      }),
    ]);
    expect(secondLesson.blockerPatterns).toEqual(
      secondSummary.minedBlockerPatterns,
    );
  });

  it('serializes blocker mining across recorders that share a blocker store', async () => {
    const firstPort = createMockMemoryPort();
    const secondPort = createMockMemoryPort();
    const sharedBlockerStore = new Map();
    const releaseFirstRecordLesson: (() => void)[] = [];
    (firstPort.recordLesson as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstRecordLesson.push(resolve);
        }),
    );
    const firstRecorder = new LessonRecorder(firstPort, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      blockerPatternStore: sharedBlockerStore,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const secondRecorder = new LessonRecorder(secondPort, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      blockerPatternStore: sharedBlockerStore,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Shared recorder stores must not miss threshold crossing',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = firstRecorder.record(result, 'task-a');
    await Promise.resolve();
    expect(firstPort.recordLesson).toHaveBeenCalledTimes(1);

    const secondRecord = secondRecorder.record(result, 'task-b');
    await Promise.resolve();
    expect(secondPort.recordLesson).not.toHaveBeenCalled();

    releaseFirstRecordLesson[0]!();
    await firstRecord;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(secondPort.recordLesson).toHaveBeenCalledTimes(1);
    const secondSummary = await secondRecord;

    expect(secondSummary.minedBlockerPatterns).toEqual([
      expect.objectContaining({
        occurrences: 2,
        taskIds: ['task-a', 'task-b'],
      }),
    ]);
  });

  it('deduplicates repeated critical blocker findings within one lesson', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const firstResult: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Duplicate critical blocker should be mined once',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };
    const duplicateResult: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Duplicate critical blocker should be mined once',
            severity: 'critical',
          },
          {
            message: 'Duplicate critical blocker should be mined once',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(firstResult, 'task-a');
    const secondSummary = await recorder.record(duplicateResult, 'task-b');

    expect(secondSummary.minedBlockerPatterns).toHaveLength(1);
    expect(secondSummary.minedBlockerPatterns[0]!.taskIds).toEqual([
      'task-a',
      'task-b',
    ]);
  });

  it('keeps already-mined blocker repeats subject to cooldown', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      blockerPatternThreshold: 2,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Already-routed blocker pattern should not bypass cooldown forever',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:00:10.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    now = new Date('2026-07-12T10:00:20.000Z');
    const thirdSummary = await recorder.record(result, 'task-c');

    expect(secondSummary.recorded).toBe(1);
    expect(secondSummary.minedBlockerPatterns).toHaveLength(1);
    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(thirdSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [expect.objectContaining({ taskId: 'task-c' })],
      minedBlockerPatterns: [],
    });
  });

  it('rolls back blocker observations when lesson persistence fails', async () => {
    const port = createMockMemoryPort();
    (port.recordLesson as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('transient memory failure'))
      .mockResolvedValue(undefined);
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Memory failure should not leave phantom blocker observations',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const failedSummary = await recorder.record(result, 'task-a');
    const secondSummary = await recorder.record(result, 'task-b');

    expect(failedSummary).toEqual({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toEqual({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('does not mine blocker patterns from repeated observations on the same task', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Approval blocker prevented pushing the prepared fix',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    const secondSummary = await recorder.record(result, 'task-a');

    expect(secondSummary.minedBlockerPatterns).toEqual([]);
  });

  it('does not mine warning-only findings as blocker patterns', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR handoff omitted one optional verification note',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    const secondSummary = await recorder.record(result, 'task-b');

    expect(secondSummary.minedBlockerPatterns).toEqual([]);
  });

  it('rejects invalid cooldown windows explicitly', () => {
    const port = createMockMemoryPort();
    const expectedMessage =
      'LessonRecorder cooldownMs must be a finite, non-negative number within the supported Date range.';

    expect(() => new LessonRecorder(port, { cooldownMs: -1 })).toThrow(
      expectedMessage,
    );
    expect(
      () => new LessonRecorder(port, { cooldownMs: Number.POSITIVE_INFINITY }),
    ).toThrow(expectedMessage);
    expect(() => new LessonRecorder(port, { cooldownMs: 10 ** 16 })).toThrow(
      expectedMessage,
    );
  });

  it('does not create an experimental sandbox entry for failing iterations with no actionable finding', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'empty-failure'),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'sandbox-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('does not create traceability entries for infrastructure-only evaluator exceptions', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'adr-compliance', [
          {
            message: 'internal evaluator error occurred',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('includes correction info from the failing iteration', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'complexity', [
          { message: 'too many params', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    const call = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      correctionApplied: string;
      timestamp: string;
    };
    expect(call.correctionApplied).toBeTruthy();
    expect(call.timestamp).toBeTruthy();
  });

  it('records a lesson when multi-iteration recovery ends with warnings', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'warn',
      iterations: [
        createIteration(0, 'fail', 'complexity', [
          { message: 'too many params', severity: 'warning' },
        ]),
        createIteration(1, 'warn', 'adr-compliance', [
          { message: 'review ADR', severity: 'warning' },
        ]),
      ],
    };

    await recorder.record(result, 'task-123');

    const call = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      correctionApplied: string;
    };
    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(call.correctionApplied).toBe('Corrected in iteration 1');
  });

  it('does not record evaluator infrastructure exceptions as learned critique lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'adr-compliance', [
          {
            message:
              'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('does not record on fail verdict', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'fail',
      iterations: [createIteration(0, 'fail')],
      correction: {
        summary: 'fix it',
        findings: [],
        score: 0.3,
        iterationCount: 1,
      },
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('does not record on halted verdict', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'halted',
      iterations: [createIteration(0, 'fail')],
      reason: 'max iterations',
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('swallows errors from MemoryPort gracefully', async () => {
    const port = createMockMemoryPort();
    (port.recordLesson as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB down'),
    );
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'safety', [
          { message: 'issue', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    // Should not throw and should report that no lesson was persisted.
    await expect(recorder.record(result, 'test-task')).resolves.toEqual({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });
});
