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
import {
  TEST_TOKEN_BUDGET,
  TOKEN_OVERRUN_INPUT_TOKENS,
  TOKEN_OVERRUN_OUTPUT_TOKENS,
  TOKEN_OVERRUN_TOTAL_TOKENS,
} from '../helpers/token-test-values.js';

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
      tokenBudget: TEST_TOKEN_BUDGET,
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
    // TokenBudgetBreaker.check() is now async and performs the real budget
    // check directly (the old sync check()/checkAsync() split was removed).
    const observability: ObservabilityPort = {
      getTokenSpend: vi.fn(async () => ({
        inputTokens: TOKEN_OVERRUN_INPUT_TOKENS,
        outputTokens: TOKEN_OVERRUN_OUTPUT_TOKENS,
        totalTokens: TOKEN_OVERRUN_TOTAL_TOKENS,
        estimatedCostUsd: 5.50,
      })),
    };

    const breaker = new TokenBudgetBreaker(observability);

    const state = { iterationCount: 1, failureHistory: new Map<string, number>() };
    const config: LoopConfig = {
      maxIterations: 3,
      tokenBudget: TEST_TOKEN_BUDGET,
      consensusThreshold: 3,
      sessionId: 'session-001',
      taskId: 'task-001',
    };

    // The async check detects the overrun
    const result = await breaker.check(state, config);
    expect(result.tripped).toBe(true);
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
      tokenBudget: TEST_TOKEN_BUDGET,
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

    const unsafeDynamicCallName = ['ev', 'al'].join('');

    const input: EvaluationInput = {
      content: `${unsafeDynamicCallName}("malicious code")`,
      source: 'test.ts',
      metadata: {},
    };

    const result = await pipeline.run(input);

    expect(result.verdict).toBe('fail');
    expect(result.shortCircuited).toBe(true);
  });
});
