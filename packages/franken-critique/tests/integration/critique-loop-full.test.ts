import { describe, it, expect, vi } from 'vitest';
import { createReviewer } from '../../src/reviewer.js';
import type { GuardrailsPort, MemoryPort, ObservabilityPort } from '../../src/types/contracts.js';
import type { EvaluationInput } from '../../src/types/evaluation.js';
import type { LoopConfig } from '../../src/types/loop.js';

function createMockGuardrailsPort(): GuardrailsPort {
  return {
    getSafetyRules: vi.fn().mockResolvedValue([
      { id: 'r1', description: 'no eval', pattern: 'eval\\(', severity: 'block' },
    ]),
    executeSandbox: vi.fn().mockResolvedValue({
      success: true,
      output: '',
      exitCode: 0,
      timedOut: false,
    }),
  };
}

function createMockMemoryPort(): MemoryPort {
  return {
    searchADRs: vi.fn().mockResolvedValue([]),
    searchEpisodic: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockObservabilityPort(totalTokens = 1000): ObservabilityPort {
  return {
    getTokenSpend: vi.fn().mockResolvedValue({
      inputTokens: Math.floor(totalTokens * 0.6),
      outputTokens: Math.floor(totalTokens * 0.4),
      totalTokens,
      estimatedCostUsd: totalTokens * 0.00001,
    }),
  };
}

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

function createLoopConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    maxIterations: 3,
    tokenBudget: 100000,
    consensusThreshold: 3,
    sessionId: 'integration-test-session',
    taskId: 'integration-test-task',
    ...overrides,
  };
}

describe('Full Critique Loop Integration', () => {
  it('passes clean code on first iteration', async () => {
    const reviewer = createReviewer({
      guardrails: createMockGuardrailsPort(),
      memory: createMockMemoryPort(),
      observability: createMockObservabilityPort(),
      knownPackages: ['express', 'zod'],
    });

    const result = await reviewer.review(
      createInput('function add(a: number, b: number): number { return a + b; }'),
      createLoopConfig(),
    );

    expect(result.verdict).toBe('pass');
    expect(result.iterations).toHaveLength(1);
  });

  it('fails code with safety violations', async () => {
    const reviewer = createReviewer({
      guardrails: createMockGuardrailsPort(),
      memory: createMockMemoryPort(),
      observability: createMockObservabilityPort(),
      knownPackages: [],
    });

    const result = await reviewer.review(
      createInput('eval("malicious code")'),
      createLoopConfig({ maxIterations: 1 }),
    );

    expect(result.verdict).toBe('fail');
    if (result.verdict === 'fail') {
      expect(result.correction.findings.length).toBeGreaterThan(0);
      expect(result.correction.findings.some((f) =>
        f.message.toLowerCase().includes('safety'),
      )).toBe(true);
    }
  });

  it('fails code with ghost dependencies', async () => {
    const reviewer = createReviewer({
      guardrails: createMockGuardrailsPort(),
      memory: createMockMemoryPort(),
      observability: createMockObservabilityPort(),
      knownPackages: ['express'],
    });

    const result = await reviewer.review(
      createInput("import ghost from 'nonexistent-package';"),
      createLoopConfig({ maxIterations: 1 }),
    );

    expect(result.verdict).toBe('fail');
    if (result.verdict === 'fail') {
      expect(result.correction.findings.some((f) =>
        f.message.includes('nonexistent-package'),
      )).toBe(true);
    }
  });

  it('detects infinite loops in code', async () => {
    const reviewer = createReviewer({
      guardrails: createMockGuardrailsPort(),
      memory: createMockMemoryPort(),
      observability: createMockObservabilityPort(),
      knownPackages: [],
    });

    const result = await reviewer.review(
      createInput('function run() { while(true) { doWork(); } }'),
      createLoopConfig({ maxIterations: 1 }),
    );

    expect(result.verdict).toBe('fail');
  });

  it('does not record lessons for first-pass successes', async () => {
    const memory = createMockMemoryPort();
    const reviewer = createReviewer({
      guardrails: createMockGuardrailsPort(),
      memory,
      observability: createMockObservabilityPort(),
      knownPackages: [],
    });

    await reviewer.review(
      createInput('const x = 1;'),
      createLoopConfig(),
    );

    expect(memory.recordLesson).not.toHaveBeenCalled();
  });

  it('all evaluators contribute to the critique result', async () => {
    const reviewer = createReviewer({
      guardrails: createMockGuardrailsPort(),
      memory: createMockMemoryPort(),
      observability: createMockObservabilityPort(),
      knownPackages: [],
    });

    const result = await reviewer.review(
      createInput('const x: number = 1;'),
      createLoopConfig(),
    );

    // All 8 evaluators should have run
    expect(result.iterations[0]!.result.results.length).toBe(8);
  });
});
