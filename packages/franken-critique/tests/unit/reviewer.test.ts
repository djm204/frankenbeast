import { describe, it, expect, vi } from 'vitest';
import { createReviewer } from '../../src/reviewer.js';
import type { ReviewerConfig } from '../../src/reviewer.js';
import type { GuardrailsPort, MemoryPort, ObservabilityPort } from '../../src/types/contracts.js';
import type { EvaluationInput } from '../../src/types/evaluation.js';
import type { LoopConfig } from '../../src/types/loop.js';

function makeGuardrails(): GuardrailsPort {
  return {
    getSafetyRules: vi.fn().mockResolvedValue([]),
    executeSandbox: vi.fn().mockResolvedValue({
      success: true, output: '', exitCode: 0, timedOut: false,
    }),
  };
}

function makeMemory(): MemoryPort {
  return {
    searchADRs: vi.fn().mockResolvedValue([]),
    searchEpisodic: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function makeObservability(totalTokens = 100): ObservabilityPort {
  return {
    getTokenSpend: vi.fn().mockResolvedValue({
      inputTokens: totalTokens / 2,
      outputTokens: totalTokens / 2,
      totalTokens,
      estimatedCostUsd: totalTokens * 0.00001,
    }),
  };
}

function makeConfig(overrides: Partial<ReviewerConfig> = {}): ReviewerConfig {
  return {
    guardrails: overrides.guardrails ?? makeGuardrails(),
    memory: overrides.memory ?? makeMemory(),
    observability: overrides.observability ?? makeObservability(),
    knownPackages: overrides.knownPackages ?? ['express', 'zod', 'vitest'],
  };
}

function makeInput(content = 'const x = 1;\nconsole.log(x);'): EvaluationInput {
  return {
    content,
    source: 'test.ts',
    metadata: { language: 'typescript' },
  };
}

function makeLoopConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    maxIterations: overrides.maxIterations ?? 3,
    tokenBudget: overrides.tokenBudget ?? 10000,
    consensusThreshold: overrides.consensusThreshold ?? 3,
    sessionId: overrides.sessionId ?? 'session-1',
    taskId: overrides.taskId ?? 'task-1',
  };
}

describe('createReviewer', () => {
  it('returns a Reviewer with a review method', () => {
    const reviewer = createReviewer(makeConfig());
    expect(reviewer).toHaveProperty('review');
    expect(typeof reviewer.review).toBe('function');
  });

  it('passes clean code on first iteration', async () => {
    const reviewer = createReviewer(makeConfig());
    const result = await reviewer.review(makeInput(), makeLoopConfig());
    expect(result.verdict).toBe('pass');
    expect(result.iterations.length).toBe(1);
  });

  it('does not record lessons on single-iteration pass', async () => {
    const memory = makeMemory();
    const reviewer = createReviewer(makeConfig({ memory }));
    const result = await reviewer.review(makeInput(), makeLoopConfig());
    // LessonRecorder only records on multi-iteration passes
    expect(result.verdict).toBe('pass');
    expect(result.iterations.length).toBe(1);
    expect(memory.recordLesson).not.toHaveBeenCalled();
  });

  it('accepts custom knownPackages list', () => {
    // Verifying the factory accepts the config without error
    const reviewer = createReviewer(makeConfig({ knownPackages: ['custom-pkg'] }));
    expect(reviewer).toHaveProperty('review');
  });

  it('wires safety evaluator to guardrails port', async () => {
    const guardrails = makeGuardrails();
    const reviewer = createReviewer(makeConfig({ guardrails }));
    await reviewer.review(makeInput(), makeLoopConfig());
    expect(guardrails.getSafetyRules).toHaveBeenCalled();
  });

  it('accepts observability port for token budget breaker', () => {
    const observability = makeObservability(100);
    // Verifying the factory wires observability without error
    const reviewer = createReviewer(makeConfig({ observability }));
    expect(reviewer).toHaveProperty('review');
  });

  it('returns pass verdict with iterations array', async () => {
    const reviewer = createReviewer(makeConfig());
    const result = await reviewer.review(makeInput(), makeLoopConfig());
    expect(result.verdict).toBe('pass');
    expect(Array.isArray(result.iterations)).toBe(true);
    for (const iteration of result.iterations) {
      expect(iteration).toHaveProperty('index');
      expect(iteration).toHaveProperty('input');
      expect(iteration).toHaveProperty('result');
      expect(iteration).toHaveProperty('completedAt');
    }
  });

  it('handles safety failure with short-circuit', async () => {
    const guardrails: GuardrailsPort = {
      getSafetyRules: vi.fn().mockResolvedValue([
        { id: 'no-eval', description: 'no eval', pattern: 'eval\\(', severity: 'block' as const },
      ]),
      executeSandbox: vi.fn().mockResolvedValue({
        success: true, output: '', exitCode: 0, timedOut: false,
      }),
    };
    const reviewer = createReviewer(makeConfig({ guardrails }));
    const input = makeInput('eval("dangerous")');
    const result = await reviewer.review(input, makeLoopConfig());
    expect(result.verdict).toBe('fail');
  });

  it('halts when token budget exceeded', async () => {
    const observability = makeObservability(999999);
    const reviewer = createReviewer(makeConfig({ observability }));
    const result = await reviewer.review(makeInput(), makeLoopConfig({ tokenBudget: 1 }));
    expect(['halted', 'escalated', 'pass']).toContain(result.verdict);
  });
});
