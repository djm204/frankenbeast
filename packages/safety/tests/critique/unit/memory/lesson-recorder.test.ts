import { describe, it, expect, vi } from 'vitest';
import { LessonRecorder } from '../../../../src/critique/memory/lesson-recorder.js';
import type { MemoryPort } from '../../../../src/critique/types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../../../../src/critique/types/loop.js';
import type { CritiqueResult } from '../../../../src/critique/types/evaluation.js';

function createMockMemoryPort(): MemoryPort {
  return {
    searchADRs: vi.fn().mockResolvedValue([]),
    searchEpisodic: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function createIteration(
  index: number,
  verdict: 'pass' | 'fail',
  evaluatorName = 'mock',
  findings: { message: string; severity: 'critical' | 'warning' | 'info' }[] = [],
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
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'safety', [{ message: 'eval() detected', severity: 'critical' }]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(port.recordLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatorName: 'safety',
        failureDescription: expect.stringContaining('eval()'),
        taskId: 'test-task',
      }),
    );
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
