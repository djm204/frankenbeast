import { describe, expect, it } from 'vitest';
import type { BeastInput, BeastPhase, BeastResult, TaskOutcome } from '../src/index.js';
import { makeTokenSpend } from '../src/index.js';

describe('core orchestration contracts', () => {
  it('exports Beast Loop contracts from @franken/types', () => {
    const input: BeastInput = {
      projectId: 'project-1',
      userInput: 'ship it',
      dryRun: true,
    };
    const outcome: TaskOutcome = {
      taskId: 'task-1',
      status: 'success',
      output: { changed: true },
    };
    const phase: BeastPhase = 'closure';
    const result: BeastResult = {
      sessionId: 'session-1',
      projectId: input.projectId,
      phase,
      status: 'completed',
      tokenSpend: makeTokenSpend(10, 5, 0.01),
      taskResults: [outcome],
      durationMs: 25,
    };

    expect(result).toMatchObject({
      projectId: 'project-1',
      phase: 'closure',
      status: 'completed',
      taskResults: [{ taskId: 'task-1', status: 'success' }],
    });
  });
});
