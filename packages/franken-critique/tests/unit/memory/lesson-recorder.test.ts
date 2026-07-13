import { describe, it, expect, vi } from 'vitest';
import { LessonRecorder, detectLessonContradictions } from '../../../src/memory/lesson-recorder.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../../../src/types/evaluation.js';
import type { MemoryPort, CritiqueLesson } from '../../../src/types/contracts.js';
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
  return createIterationFromResult(index, result);
}

function createIterationFromResult(
  index: number,
  result: CritiqueResult,
): CritiqueIteration {
  return {
    index,
    input: { content: `iteration ${index}`, metadata: {} },
    result,
    completedAt: new Date().toISOString(),
  };
}

function createLesson(overrides: Partial<CritiqueLesson> = {}): CritiqueLesson {
  return {
    evaluatorName: 'factuality',
    failureDescription: 'Cache guidance allowed unaudited stale responses',
    correctionApplied: 'Require cache verification before reuse',
    taskId: 'lesson-task',
    timestamp: '2026-07-11T00:00:00.000Z',
    ...overrides,
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

  it('uses the first failed evaluator score and recovered evaluator score in per-agent scorecards', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, { agentId: 'worker-alpha' });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIterationFromResult(0, {
          verdict: 'fail',
          overallScore: 0.2,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.1,
              findings: [{ message: 'missing verifier', severity: 'warning' }],
            },
            {
              evaluatorName: 'style-gate',
              verdict: 'pass',
              score: 0.9,
              findings: [],
            },
          ],
        }),
        createIterationFromResult(1, {
          verdict: 'fail',
          overallScore: 0.4,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.5,
              findings: [{ message: 'partial verifier', severity: 'warning' }],
            },
          ],
        }),
        createIterationFromResult(2, {
          verdict: 'pass',
          overallScore: 0.6,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'pass',
              score: 0.95,
              findings: [],
            },
            {
              evaluatorName: 'style-gate',
              verdict: 'warn',
              score: 0.25,
              findings: [{ message: 'style nit', severity: 'warning' }],
            },
          ],
        }),
      ],
    };

    await recorder.record(result, 'scorecard-task');

    const firstLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(firstLesson.agentImprovementScorecard).toMatchObject({
      evaluatorName: 'quality-gate',
      initialScore: 0.1,
      finalScore: 0.95,
      scoreDelta: 0.85,
      failingIterations: [0, 1],
      resolvedIteration: 2,
      findingCounts: {
        critical: 0,
        warning: 2,
        info: 0,
        total: 2,
      },
    });
  });

  it('excludes evaluator infrastructure exceptions from per-agent scorecards', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, { agentId: 'worker-alpha' });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIterationFromResult(0, {
          verdict: 'fail',
          overallScore: 0.05,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.05,
              findings: [
                {
                  message: 'evaluator crashed',
                  severity: 'critical',
                  location: EVALUATOR_EXCEPTION_LOCATION,
                },
              ],
            },
          ],
        }),
        createIterationFromResult(1, {
          verdict: 'fail',
          overallScore: 0.4,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.4,
              findings: [{ message: 'missing verifier', severity: 'warning' }],
            },
          ],
        }),
        createIterationFromResult(2, {
          verdict: 'pass',
          overallScore: 1,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'pass',
              score: 1,
              findings: [],
            },
          ],
        }),
      ],
    };

    await recorder.record(result, 'scorecard-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(lesson.agentImprovementScorecard).toMatchObject({
      initialScore: 0.4,
      finalScore: 1,
      scoreDelta: 0.6,
      failingIterations: [1],
      findingCounts: {
        critical: 0,
        warning: 1,
        info: 0,
        total: 1,
      },
    });
  });

  it('rejects blank per-agent scorecard ids so PM summaries do not group lessons under an ambiguous agent', () => {
    expect(
      () => new LessonRecorder(createMockMemoryPort(), { agentId: '  ' }),
    ).toThrow('LessonRecorder agentId must be a non-empty string when provided.');
  });

  it('returns an LLM-friendly learning backlog prioritization report for PM handoffs', async () => {
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
            message: 'Codex blocker was left unresolved',
            severity: 'critical',
            suggestion: 'Resolve the current-head review thread before merge.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const summary = await recorder.record(result, 'learning-backlog-task');

    expect(summary.learningBacklogPrioritizationReport).toEqual({
      schemaVersion: 'learning-backlog-prioritization-report-v1',
      generatedAt: '2026-07-12T00:00:00.000Z',
      guidance:
        'Use this report to sort newly observed learning backlog items before promotion, retirement, or PM routing; higher priority items should receive durable mitigation before low-risk documentation follow-up.',
      items: [
        {
          id: expect.stringMatching(/^lesson:learning-backlog-task:quality-gate:iteration-0$/),
          source: 'recorded-lesson',
          priority: 'high',
          score: 80,
          taskId: 'learning-backlog-task',
          evaluatorName: 'quality-gate',
          title: 'Codex blocker was left unresolved',
          rationale:
            'Recorded lesson contains critical findings and should be reviewed before routine learning cleanup.',
          recommendedAction:
            'Route this lesson through promotion review with its traceability verifier before adding it to durable guidance.',
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(summary))).toMatchObject({
      learningBacklogPrioritizationReport: {
        schemaVersion: 'learning-backlog-prioritization-report-v1',
        items: [
          expect.objectContaining({
            source: 'recorded-lesson',
            priority: 'high',
          }),
        ],
      },
    });
  });

  it('prioritizes suppressed duplicate learning items as low-risk reuse follow-up', async () => {
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

    expect(suppressed.learningBacklogPrioritizationReport.items).toEqual([
      expect.objectContaining({
        source: 'cooldown-suppression',
        priority: 'low',
        score: 20,
        taskId: 'second-task',
        evaluatorName: 'learning-reviewer',
        recommendedAction:
          'Reuse the existing in-cooldown lesson until suppression expires; do not create a duplicate backlog item.',
      }),
    ]);
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
        'Check the contradiction report and resolve any conflicting prior lesson before promotion.',
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
    expect(summary).toMatchObject({
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
    expect(admitted).toMatchObject({
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
    expect(suppressed).toMatchObject({
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
    expect(firstSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
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
    expect(disabledSummary).toMatchObject({
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
    expect(secondSummary).toMatchObject({
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
    expect(firstSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
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
    expect(firstSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(thirdSummary).toMatchObject({
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
    expect(secondSummary).toMatchObject({
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
    expect(secondSummary).toMatchObject({
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

    expect(secondSummary).toMatchObject({
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
    expect(thirdSummary).toMatchObject({
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

    expect(failedSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
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

  it('attaches a not-checked contradiction report when lesson search is unavailable', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          { message: 'Cache guidance allowed unaudited stale responses', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(lesson.contradictionReport).toEqual({
      status: 'not_checked',
      guidance:
        'No lesson search adapter is available, so historical lesson contradictions were not checked.',
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      contradictions: [],
    });
  });

  it('attaches a clear contradiction report when comparable prior lessons do not conflict', async () => {
    const port = createMockMemoryPort();
    port.searchLessons = vi.fn().mockResolvedValue([
      createLesson({
        failureDescription: 'Cache guidance reused stale responses without checking provenance',
        correctionApplied: 'Require cache verification and provenance review before reuse',
      }),
    ]);
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          { message: 'Cache guidance allowed unaudited stale responses', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(port.searchLessons).toHaveBeenCalledWith(
      expect.stringContaining('Cache guidance allowed unaudited stale responses'),
      10,
    );
    expect(lesson.contradictionReport).toEqual({
      status: 'clear',
      guidance: 'No deterministic lesson contradiction was detected among comparable prior lessons.',
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      contradictions: [],
    });
  });

  it('detects same-evaluator lesson contradictions with shared terms and negated guidance', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      testTraceability: [
        {
          lessonId: 'prior-cache-lesson',
          taskId: 'prior-task',
          evaluatorName: 'factuality',
          failingIteration: 0,
          resolvedIteration: 1,
          sourceFindingMessages: ['Cache guidance allowed unaudited stale responses'],
          testId: 'prior-cache-lesson:regression',
          verificationCommand: 'npm run test --workspace @franken/critique',
        },
      ],
      correctionApplied: 'Reuse cache responses',
    });

    const report = detectLessonContradictions(current, [prior]);

    expect(report.status).toBe('contradiction_detected');
    expect(report.guidance).toContain('Promotion is blocked');
    expect(report.contradictions).toEqual([
      expect.objectContaining({
        conflictingLessonId: 'prior-cache-lesson',
        evaluatorName: 'factuality',
        sharedTerms: expect.arrayContaining(['cache', 'responses', 'reuse']),
        conflictingCorrectionApplied: 'Reuse cache responses',
      }),
    ]);
  });

  it('detects contradictions from recorded reviewer guidance when correction summaries are generic', () => {
    const current = createLesson({
      failureDescription: 'Cache reuse guidance regression',
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse lacked provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse lacked provenance checks',
            severity: 'critical',
            suggestion: 'Do not reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: true,
      },
    });
    const prior = createLesson({
      failureDescription: 'Cache reuse guidance regression',
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse was allowed without requiring provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed without requiring provenance checks',
            severity: 'critical',
            suggestion: 'Reuse cache responses',
          },
        ],
        suggestionsComplete: true,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          evaluatorName: 'factuality',
          sharedTerms: expect.arrayContaining(['cache', 'responses', 'reuse']),
        }),
      ],
    });
  });

  it('uses stable fallback ids for legacy contradictory lessons', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses',
    });

    const unrelated = createLesson({
      failureDescription: 'Token logging exposed credentials',
      correctionApplied: 'Redact tokens before logging',
    });

    const firstReport = detectLessonContradictions(current, [prior]);
    const secondReport = detectLessonContradictions(current, [unrelated, prior]);
    const secondPriorContradiction = secondReport.contradictions.find(
      (contradiction) =>
        contradiction.conflictingCorrectionApplied === prior.correctionApplied,
    );

    expect(firstReport.contradictions[0]!.conflictingLessonId).toMatch(
      /^legacy-lesson-/,
    );
    expect(secondPriorContradiction).toBeDefined();
    expect(firstReport.contradictions[0]!.conflictingLessonId).toBe(
      secondPriorContradiction!.conflictingLessonId,
    );
  });

  it('reports search adapter failures distinctly from missing lesson search', async () => {
    const port = createMockMemoryPort();
    port.searchLessons = vi.fn().mockRejectedValue(new Error('memory unavailable'));
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          { message: 'Cache guidance allowed unaudited stale responses', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.contradictionReport).toMatchObject({
      status: 'not_checked',
      guidance: expect.stringContaining('Lesson search adapter failed'),
      contradictions: [],
    });
  });

  it('uses corrective guidance polarity so failure prose negation alone does not block matching fixes', () => {
    const current = createLesson({
      failureDescription: 'Cache did not verify provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
    });
    const prior = createLesson({
      failureDescription: 'Cache skipped provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('ignores reviewer finding prose when checking corrective guidance polarity', () => {
    const current = createLesson({
      failureDescription: 'Cache did not verify provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
      reviewerFeedback: {
        summary: 'Cache did not verify provenance before reuse',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache did not verify provenance before reuse',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const prior = createLesson({
      failureDescription: 'Cache skipped provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
      reviewerFeedback: {
        summary: 'Cache skipped provenance before reuse',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache skipped provenance before reuse',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('distinguishes leading prohibitions from conditional without clauses', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses without provenance checks',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          sharedTerms: expect.arrayContaining(['cache', 'responses', 'reuse']),
        }),
      ],
    });
  });

  it('does not contradict compatible conditional provenance guidance', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses when provenance checks are present',
    });
    const requirePrior = createLesson({
      correctionApplied: 'Require provenance checks before cache reuse',
    });

    expect(detectLessonContradictions(current, [prior, requirePrior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('does not contradict with-guarded or if-guarded prerequisite allowances', () => {
    for (const guardedAllowance of ['Deploy with approval', 'Deploy if approval']) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: 'Do not deploy without approval' }),
          [createLesson({ correctionApplied: guardedAllowance })],
        ),
      ).toMatchObject({ status: 'clear', contradictions: [] });
    }
  });

  it('treats deny directives as negative guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Deny API access' }),
        [createLesson({ correctionApplied: 'Allow API access' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('checks directive-shaped reviewer messages when suggestions are absent', () => {
    const current = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache guidance regression',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Do not reuse cache responses without provenance checks',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const prior = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache guidance regression',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Reuse cache responses without provenance checks',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
    });
  });

  it('treats run as a positive directive for test guidance reversals', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not run tests' }),
        [createLesson({ correctionApplied: 'Run tests' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats until prerequisites as compatible guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy until approval' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits bare conjunction mixed directives before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens and rotate keys' }),
        [createLesson({ correctionApplied: 'Rotate keys' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not treat denied or rejected guard outcomes as compatible allowances', () => {
    for (const guardedAllowance of ['Deploy if approval is denied', 'Deploy if approval rejected']) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: 'Do not deploy without approval' }),
          [createLesson({ correctionApplied: guardedAllowance })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('reports matched reviewer guidance when the correction summary is generic', () => {
    const current = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse lacked provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse lacked provenance checks',
            severity: 'critical',
            suggestion: 'Do not reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: true,
      },
    });
    const prior = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse was allowed without provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed without provenance checks',
            severity: 'critical',
            suggestion: 'Reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: true,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          conflictingCorrectionApplied: 'Corrected in iteration 1',
          conflictingGuidance: 'Reuse cache responses without provenance checks',
        }),
      ],
    });
  });

  it('recognizes should not as negated directive guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Should not log PII' }),
        [createLesson({ correctionApplied: 'Should log PII' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats mid-clause negation as compatible with equivalent prohibitions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow requests that do not include PII' }),
        [createLesson({ correctionApplied: 'Do not allow requests that include PII' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('keeps punctuation-delimited clauses out of without guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied:
            'Do not reuse cache without provenance checks; rotate cache keys after deploy',
        }),
        [createLesson({ correctionApplied: 'Reuse cache after deploy' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats unless guards as compatible conditional guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid cache reuse unless provenance checks pass' }),
        [createLesson({ correctionApplied: 'Reuse cache when provenance checks pass' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits embedded negated directives from positive prefaces', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied: 'Validate provenance and do not reuse cache responses',
        }),
        [createLesson({ correctionApplied: 'Reuse cache responses' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('preserves directive context for short without guard clauses', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication before API access' }),
        [createLesson({ correctionApplied: 'Allow API access without authentication' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('does not treat opposite conditional outcomes as compatible guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid cache reuse unless provenance checks pass' }),
        [createLesson({ correctionApplied: 'Reuse cache when provenance checks fail' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('keeps non-prefixed short technical terms distinct', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log PII' }),
        [createLesson({ correctionApplied: 'Log non-PII diagnostics' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats single-term guards as compatible when directive terms also overlap', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits punctuation-delimited directives before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied:
            'Do not cache unauthenticated profiles; cache profile metadata after validation',
        }),
        [createLesson({ correctionApplied: 'Cache profile metadata after validation' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('recognizes embedded never and cannot prohibitions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Validate headers and never cache tokens' }),
        [createLesson({ correctionApplied: 'Cache tokens' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Validate headers and cannot cache tokens' }),
        [createLesson({ correctionApplied: 'Cache tokens' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('does not self-contradict duplicate positive without guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Reuse cache without provenance checks' }),
        [createLesson({ correctionApplied: 'Reuse cache without provenance checks' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits newline-delimited directive clauses before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log PII\nLog debug metrics' }),
        [createLesson({ correctionApplied: 'Log debug metrics' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens, and rotate keys' }),
        [createLesson({ correctionApplied: 'Rotate keys' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('ignores generic directive verbs when testing object overlap', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not allow API writes' }),
        [createLesson({ correctionApplied: 'Allow API reads' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats before prerequisites as compatible guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy before approval' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not negate positive before prerequisite guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require approval before deploy' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('excludes guard words from shared-term matching', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Delete backups without approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats missing prerequisites as opposed guard outcomes', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid cache reuse unless provenance checks pass' }),
        [createLesson({ correctionApplied: 'Reuse cache when provenance checks are missing' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy when approval is missing' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('recognizes bypass-style prohibitive directives as negative guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication before API access' }),
        [createLesson({ correctionApplied: 'Bypass authentication before API access' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats positive without and negative with prohibitions as equivalent', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Run tests without network access' }),
        [createLesson({ correctionApplied: 'Do not run tests with network access' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('filters must as a modal stop word', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Must not log tokens' }),
        [createLesson({ correctionApplied: 'Must rotate tokens' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats require as a positive one-object directive', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication' }),
        [createLesson({ correctionApplied: 'Bypass authentication' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats valid and invalid qualified allowances as compatible', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow requests with valid tokens' }),
        [createLesson({ correctionApplied: 'Do not allow requests with invalid tokens' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats missing prerequisites as contradictions against required guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy when approval is missing' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('normalizes common singular and plural comparable terms', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log tokens' }),
        [createLesson({ correctionApplied: 'Log token' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('splits comma-and mixed directives before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens, and rotate keys' }),
        [createLesson({ correctionApplied: 'Rotate keys' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('detects one-object directive reversals', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Disable cache' }),
        [createLesson({ correctionApplied: 'Enable cache' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy' }),
        [createLesson({ correctionApplied: 'Deploy' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log tokens' }),
        [createLesson({ correctionApplied: 'Log token' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('recognizes disallow and prohibit as negated directive guidance', () => {
    const current = createLesson({
      correctionApplied: 'Disallow cache reuse',
    });
    const prior = createLesson({
      correctionApplied: 'Allow cache reuse',
    });
    const prohibitCurrent = createLesson({
      correctionApplied: 'Prohibit API access',
    });
    const permitPrior = createLesson({
      correctionApplied: 'Permit API access',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
    });
    expect(detectLessonContradictions(prohibitCurrent, [permitPrior])).toMatchObject({
      status: 'contradiction_detected',
    });
  });

  it('includes reviewer guidance in search queries for lessons with generic correction summaries', async () => {
    const port = createMockMemoryPort();
    port.searchLessons = vi.fn().mockResolvedValue([]);
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          {
            message: 'Do not reuse cache responses without provenance checks',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    expect(port.searchLessons).toHaveBeenCalledWith(
      expect.stringContaining('Do not reuse cache responses without provenance checks'),
      10,
    );
  });

  it('includes reviewer guidance in stable legacy fallback ids', () => {
    const base = {
      failureDescription: 'Cache reuse guidance regression',
      correctionApplied: 'Corrected in iteration 1',
    };
    const reusePrior = createLesson({
      ...base,
      reviewerFeedback: {
        summary: 'Reuse cache responses without constraints',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed without constraints',
            severity: 'critical',
            suggestion: 'Reuse cache responses',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const allowPrior = createLesson({
      ...base,
      reviewerFeedback: {
        summary: 'Allow cache reuse for matching requests',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed for matching requests',
            severity: 'critical',
            suggestion: 'Allow cache reuse',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const current = createLesson({
      ...base,
      reviewerFeedback: {
        summary: 'Do not reuse cache responses without provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse lacked provenance checks',
            severity: 'critical',
            suggestion: 'Do not reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: false,
      },
    });

    const report = detectLessonContradictions(current, [reusePrior, allowPrior]);

    expect(report.contradictions).toHaveLength(2);
    const ids = report.contradictions.map(
      (contradiction) => contradiction.conflictingLessonId,
    );
    expect(ids.every((id) => id.startsWith('legacy-lesson-'))).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it('treats without as corrective negation when guidance otherwise overlaps strongly', () => {
    const current = createLesson({
      correctionApplied: 'Require provenance checks before reusing cache responses',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses without provenance checks',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          sharedTerms: expect.arrayContaining(['checks', 'provenance']),
        }),
      ],
    });
  });

  it('requires stronger shared terms before blocking same-evaluator lessons', () => {
    const current = createLesson({
      failureDescription: 'Cache unauthenticated user profiles',
      correctionApplied: 'Do not cache unauthenticated user profiles',
    });
    const prior = createLesson({
      failureDescription: 'Cache dependency metadata',
      correctionApplied: 'Cache dependency metadata after checksum verification',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('does not flag unrelated evaluators or non-overlapping lessons as contradictions', () => {
    const current = createLesson({
      evaluatorName: 'factuality',
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const unrelated = createLesson({
      evaluatorName: 'security',
      failureDescription: 'Token logging exposed credentials',
      correctionApplied: 'Redact tokens before logging',
    });

    expect(detectLessonContradictions(current, [unrelated])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
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
    await expect(recorder.record(result, 'test-task')).resolves.toMatchObject({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });
});
