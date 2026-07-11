import { describe, it, expect, vi } from 'vitest';
import { LessonRecorder, createLessonRollbackWorkflow } from '../../../src/memory/lesson-recorder.js';
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

  it('adds an active lesson rollback workflow for traceable recorded lessons', async () => {
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
    expect(lesson.rollbackWorkflow).toEqual({
      rollbackId: 'task-123:safety-gate:iteration-0:rollback',
      lessonId: 'task-123:safety-gate:iteration-0',
      taskId: 'Task 123',
      evaluatorName: 'Safety Gate',
      state: 'active',
      requiredEvidence: ['rollbackReason', 'supersedingFindingOrRegression'],
      rollbackSteps: [
        'Attach the rollback reason and superseding evidence to the PM handoff.',
        'Mark the lesson as rolled back or superseded in the memory store; do not delete the original audit record.',
        'Run the lesson verification command before promoting a replacement lesson.',
      ],
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      operatorMessage:
        'Rollback task-123:safety-gate:iteration-0 only with a concrete reason and superseding evidence; preserve the original lesson for audit history.',
    });
  });

  it('builds rollback workflow metadata from a traceability entry without recording a lesson', () => {
    expect(
      createLessonRollbackWorkflow({
        lessonId: 'task-123:safety-gate:iteration-0',
        taskId: 'Task 123',
        evaluatorName: 'Safety Gate',
        failingIteration: 0,
        resolvedIteration: 2,
        sourceFindingMessages: ['plain HTTP endpoint needs HTTPS'],
        testId: 'task-123:safety-gate:iteration-0:regression',
        verificationCommand: 'npm run test --workspace @franken/critique -- --run lesson-recorder',
      }),
    ).toMatchObject({
      rollbackId: 'task-123:safety-gate:iteration-0:rollback',
      lessonId: 'task-123:safety-gate:iteration-0',
      state: 'active',
      requiredEvidence: ['rollbackReason', 'supersedingFindingOrRegression'],
      verificationCommand: 'npm run test --workspace @franken/critique -- --run lesson-recorder',
    });
  });

  it('does not create rollback workflow entries for infrastructure-only evaluator exceptions', async () => {
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
