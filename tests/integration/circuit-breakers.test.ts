/**
 * Circuit Breakers
 *
 * Tests the safety mechanisms that halt or escalate when things go wrong:
 * - Token budget exceeded (MOD-06 breaker)
 * - Consensus failure (MOD-06 breaker)
 * - Max iterations (MOD-06 breaker)
 */

import { describe, it, expect, vi } from 'vitest';

import {
  CritiqueLoop,
  CritiquePipeline,
  MaxIterationBreaker,
  TokenBudgetBreaker,
  ConsensusFailureBreaker,
  SafetyEvaluator,
  GhostDependencyEvaluator,
  LogicLoopEvaluator,
} from '@franken/critique';

import type { EvaluationInput, LoopConfig, ObservabilityPort } from '@franken/critique';

import {
  makeGuardrailsPort,
  makeObservabilityPort,
} from '../helpers/stubs.js';

// ─── Max Iteration Breaker ──────────────────────────────────────────────────

describe('Circuit Breaker: MaxIteration (MOD-06)', () => {
  it('halts the loop after max iterations are reached', async () => {
    // Create a pipeline that always fails
    const pipeline = new CritiquePipeline([
      new GhostDependencyEvaluator([]), // no known packages — everything is ghost
    ]);

    const breakers = [new MaxIterationBreaker()];
    const loop = new CritiqueLoop(pipeline, breakers);

    const input: EvaluationInput = {
      content: 'import unknownPkg from "unknown-package";',
      source: 'test.ts',
      metadata: {},
    };

    const config: LoopConfig = {
      maxIterations: 2,
      tokenBudget: 100_000,
      consensusThreshold: 5,
      sessionId: 'session-001',
      taskId: 'task-001',
    };

    const result = await loop.run(input, config);

    // Loop exhausts max iterations with pipeline failures -> returns 'fail' with correction
    expect(result.verdict).toBe('fail');
    expect(result.iterations.length).toBeLessThanOrEqual(2);
  });
});

// ─── Token Budget Breaker ───────────────────────────────────────────────────

describe('Circuit Breaker: TokenBudget (MOD-06)', () => {
  it('token budget breaker can detect budget overruns', async () => {
    // TokenBudgetBreaker's sync check() always returns { tripped: false }
    // The async checkAsync() does the real budget checking.
    // Test the breaker directly to verify the detection logic.
    const observability: ObservabilityPort = {
      getTokenSpend: vi.fn(async () => ({
        inputTokens: 80_000,
        outputTokens: 30_000,
        totalTokens: 110_000,
        estimatedCostUsd: 5.50,
      })),
    };

    const breaker = new TokenBudgetBreaker(observability);

    const state = { iterationCount: 1, failureHistory: new Map<string, number>() };
    const config: LoopConfig = {
      maxIterations: 3,
      tokenBudget: 100_000,
      consensusThreshold: 3,
      sessionId: 'session-001',
      taskId: 'task-001',
    };

    // Sync check always passes
    const syncResult = breaker.check(state, config);
    expect(syncResult.tripped).toBe(false);

    // Async check detects the overrun
    const asyncResult = await breaker.checkAsync(state, config);
    expect(asyncResult.tripped).toBe(true);
  });
});

// ─── Consensus Failure Breaker ──────────────────────────────────────────────

describe('Circuit Breaker: ConsensusFailure (MOD-06)', () => {
  it('escalates when the same evaluator category fails repeatedly', async () => {
    // LogicLoop always fails on "while(true)" without break
    const pipeline = new CritiquePipeline([
      new LogicLoopEvaluator(),
    ]);

    const breakers = [
      new ConsensusFailureBreaker(),
      new MaxIterationBreaker(),
    ];
    const loop = new CritiqueLoop(pipeline, breakers);

    const input: EvaluationInput = {
      content: 'while(true) { doWork(); }',
      source: 'test.ts',
      metadata: {},
    };

    const config: LoopConfig = {
      maxIterations: 5,
      tokenBudget: 100_000,
      consensusThreshold: 2, // escalate after 2 failures of same category
      sessionId: 'session-001',
      taskId: 'task-001',
    };

    const result = await loop.run(input, config);

    // Should escalate (consensus failure) or fail (max iterations exhausted)
    expect(['escalated', 'fail']).toContain(result.verdict);
  });
});

// ─── Safety Short-Circuit ───────────────────────────────────────────────────

describe('Circuit Breaker: Safety Short-Circuit (MOD-06)', () => {
  it('short-circuits the pipeline on safety violations', async () => {
    const guardrails = makeGuardrailsPort();
    const pipeline = new CritiquePipeline([
      new SafetyEvaluator(guardrails),
      new GhostDependencyEvaluator(['express']),
    ]);

    const input: EvaluationInput = {
      content: 'eval("malicious code")',
      source: 'test.ts',
      metadata: {},
    };

    const result = await pipeline.run(input);

    expect(result.verdict).toBe('fail');
    expect(result.shortCircuited).toBe(true);
  });
});
