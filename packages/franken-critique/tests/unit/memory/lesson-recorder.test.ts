import { describe, it, expect, vi } from 'vitest';
import { LessonRecorder } from '../../../src/memory/lesson-recorder.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../../../src/types/evaluation.js';
import type { MemoryPort } from '../../../src/types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../../../src/types/loop.js';
import type { CritiqueResult, EvaluationFinding } from '../../../src/types/evaluation.js';

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
        createIteration(0, 'fail', 'safety', [{ message: `${unsafeDynamicCallName}() detected`, severity: 'critical' }]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(port.recordLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatorName: 'safety',
        failureDescription: expect.stringContaining(`${unsafeDynamicCallName}()`),
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

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
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
            suggestion: 'Add the exact targeted test command and result to the PR description.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'review-feedback-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(lesson.reviewerFeedback).toEqual({
      summary: 'PR summary omits the verification command',
      findings: [
        {
          sourceIteration: 0,
          evaluatorName: 'reviewer',
          message: 'PR summary omits the verification command',
          severity: 'warning',
          location: 'pull-request-body',
          suggestion: 'Add the exact targeted test command and result to the PR description.',
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
          { message: 'Review identified a handoff gap without remediation guidance', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'missing-suggestion-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(lesson.reviewerFeedback).toEqual({
      summary: 'Review identified a handoff gap without remediation guidance',
      findings: [
        {
          sourceIteration: 0,
          evaluatorName: 'reviewer',
          message: 'Review identified a handoff gap without remediation guidance',
          severity: 'critical',
        },
      ],
      suggestionsComplete: false,
      missingSuggestionGuidance:
        'Reviewer feedback did not include suggestions for every finding; PM handoffs should preserve the original message and ask a reviewer to attach remediation guidance before promotion.',
    });
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
            suggestion: 'Add the exact verifier command and result before requesting promotion.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'post-pr-template-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
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
          { message: 'handoff cited an unverified file path', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'sandbox-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
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

  it('does not create an experimental sandbox entry for failing iterations with no actionable finding', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [createIteration(0, 'fail', 'empty-failure'), createIteration(1, 'pass')],
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
        createIteration(0, 'fail', 'complexity', [{ message: 'too many params', severity: 'warning' }]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    const call = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
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
        createIteration(0, 'fail', 'complexity', [{ message: 'too many params', severity: 'warning' }]),
        createIteration(1, 'warn', 'adr-compliance', [{ message: 'review ADR', severity: 'warning' }]),
      ],
    };

    await recorder.record(result, 'task-123');

    const call = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
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
            message: 'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
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
      correction: { summary: 'fix it', findings: [], score: 0.3, iterationCount: 1 },
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
    (port.recordLesson as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'safety', [{ message: 'issue', severity: 'critical' }]),
        createIteration(1, 'pass'),
      ],
    };

    // Should not throw
    await expect(recorder.record(result, 'test-task')).resolves.toBeUndefined();
  });
});
