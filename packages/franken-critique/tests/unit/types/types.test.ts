import { describe, it, expectTypeOf } from 'vitest';
import type { Severity, Verdict, Score, SessionId, TaskId } from '../../../src/types/common.js';
import type {
  EvaluationInput,
  EvaluationFinding,
  EvaluationResult,
  CritiqueResult,
  Evaluator,
} from '../../../src/types/evaluation.js';
import type {
  SafetyRule,
  SandboxResult,
  CritiqueLesson,
  TokenSpend,
  EscalationRequest,
  GuardrailsPort,
  MemoryPort,
  ObservabilityPort,
  EscalationPort,
} from '../../../src/types/contracts.js';
import type {
  LoopConfig,
  CritiqueIteration,
  CorrectionRequest,
  CritiqueLoopResult,
  CritiqueLoopPass,
  CritiqueLoopFail,
  CritiqueLoopHalted,
  CritiqueLoopEscalated,
  LoopState,
  CircuitBreaker,
  CircuitBreakerResult,
} from '../../../src/types/loop.js';

describe('common types', () => {
  it('Severity is a union of string literals', () => {
    expectTypeOf<Severity>().toEqualTypeOf<'critical' | 'warning' | 'info'>();
  });

  it('Verdict is a union of string literals', () => {
    expectTypeOf<Verdict>().toEqualTypeOf<'pass' | 'fail'>();
  });

  it('Score is a number', () => {
    expectTypeOf<Score>().toBeNumber();
  });

  it('SessionId and TaskId are strings', () => {
    expectTypeOf<SessionId>().toBeString();
    expectTypeOf<TaskId>().toBeString();
  });
});

describe('evaluation types', () => {
  it('EvaluationInput has required content and metadata', () => {
    expectTypeOf<EvaluationInput>().toHaveProperty('content');
    expectTypeOf<EvaluationInput>().toHaveProperty('metadata');
    expectTypeOf<EvaluationInput['content']>().toBeString();
  });

  it('EvaluationFinding has message and severity', () => {
    expectTypeOf<EvaluationFinding>().toHaveProperty('message');
    expectTypeOf<EvaluationFinding>().toHaveProperty('severity');
  });

  it('EvaluationResult has evaluatorName, verdict, score, findings', () => {
    expectTypeOf<EvaluationResult>().toHaveProperty('evaluatorName');
    expectTypeOf<EvaluationResult>().toHaveProperty('verdict');
    expectTypeOf<EvaluationResult>().toHaveProperty('score');
    expectTypeOf<EvaluationResult>().toHaveProperty('findings');
  });

  it('CritiqueResult has verdict, overallScore, results, shortCircuited', () => {
    expectTypeOf<CritiqueResult>().toHaveProperty('verdict');
    expectTypeOf<CritiqueResult>().toHaveProperty('overallScore');
    expectTypeOf<CritiqueResult>().toHaveProperty('results');
    expectTypeOf<CritiqueResult>().toHaveProperty('shortCircuited');
  });

  it('Evaluator has name, category, and evaluate method', () => {
    expectTypeOf<Evaluator>().toHaveProperty('name');
    expectTypeOf<Evaluator>().toHaveProperty('category');
    expectTypeOf<Evaluator>().toHaveProperty('evaluate');
  });
});

describe('contract types', () => {
  it('GuardrailsPort has getSafetyRules and executeSandbox', () => {
    expectTypeOf<GuardrailsPort>().toHaveProperty('getSafetyRules');
    expectTypeOf<GuardrailsPort>().toHaveProperty('executeSandbox');
  });

  it('MemoryPort has searchADRs, searchEpisodic, recordLesson', () => {
    expectTypeOf<MemoryPort>().toHaveProperty('searchADRs');
    expectTypeOf<MemoryPort>().toHaveProperty('searchEpisodic');
    expectTypeOf<MemoryPort>().toHaveProperty('recordLesson');
  });

  it('ObservabilityPort has getTokenSpend', () => {
    expectTypeOf<ObservabilityPort>().toHaveProperty('getTokenSpend');
  });

  it('EscalationPort has requestHumanReview', () => {
    expectTypeOf<EscalationPort>().toHaveProperty('requestHumanReview');
  });

  it('SafetyRule has id, description, pattern, severity', () => {
    expectTypeOf<SafetyRule>().toHaveProperty('id');
    expectTypeOf<SafetyRule>().toHaveProperty('description');
    expectTypeOf<SafetyRule>().toHaveProperty('pattern');
    expectTypeOf<SafetyRule>().toHaveProperty('severity');
  });

  it('SandboxResult has success, output, exitCode, timedOut', () => {
    expectTypeOf<SandboxResult>().toHaveProperty('success');
    expectTypeOf<SandboxResult>().toHaveProperty('output');
    expectTypeOf<SandboxResult>().toHaveProperty('exitCode');
    expectTypeOf<SandboxResult>().toHaveProperty('timedOut');
  });

  it('TokenSpend has inputTokens, outputTokens, totalTokens, estimatedCostUsd', () => {
    expectTypeOf<TokenSpend>().toHaveProperty('inputTokens');
    expectTypeOf<TokenSpend>().toHaveProperty('outputTokens');
    expectTypeOf<TokenSpend>().toHaveProperty('totalTokens');
    expectTypeOf<TokenSpend>().toHaveProperty('estimatedCostUsd');
  });

  it('EscalationRequest has reason, iterationCount, taskId, sessionId', () => {
    expectTypeOf<EscalationRequest>().toHaveProperty('reason');
    expectTypeOf<EscalationRequest>().toHaveProperty('iterationCount');
    expectTypeOf<EscalationRequest>().toHaveProperty('taskId');
    expectTypeOf<EscalationRequest>().toHaveProperty('sessionId');
  });

  it('CritiqueLesson has evaluatorName, failureDescription, correctionApplied', () => {
    expectTypeOf<CritiqueLesson>().toHaveProperty('evaluatorName');
    expectTypeOf<CritiqueLesson>().toHaveProperty('failureDescription');
    expectTypeOf<CritiqueLesson>().toHaveProperty('correctionApplied');
  });
});

describe('loop types', () => {
  it('LoopConfig has maxIterations, tokenBudget, consensusThreshold', () => {
    expectTypeOf<LoopConfig>().toHaveProperty('maxIterations');
    expectTypeOf<LoopConfig>().toHaveProperty('tokenBudget');
    expectTypeOf<LoopConfig>().toHaveProperty('consensusThreshold');
    expectTypeOf<LoopConfig>().toHaveProperty('sessionId');
    expectTypeOf<LoopConfig>().toHaveProperty('taskId');
  });

  it('CritiqueIteration has index, input, result, completedAt', () => {
    expectTypeOf<CritiqueIteration>().toHaveProperty('index');
    expectTypeOf<CritiqueIteration>().toHaveProperty('input');
    expectTypeOf<CritiqueIteration>().toHaveProperty('result');
    expectTypeOf<CritiqueIteration>().toHaveProperty('completedAt');
  });

  it('CorrectionRequest has summary, findings, score, iterationCount', () => {
    expectTypeOf<CorrectionRequest>().toHaveProperty('summary');
    expectTypeOf<CorrectionRequest>().toHaveProperty('findings');
    expectTypeOf<CorrectionRequest>().toHaveProperty('score');
    expectTypeOf<CorrectionRequest>().toHaveProperty('iterationCount');
  });

  it('CritiqueLoopResult is a discriminated union on verdict', () => {
    const passResult: CritiqueLoopPass = {
      verdict: 'pass',
      iterations: [],
    };
    expectTypeOf(passResult).toMatchTypeOf<CritiqueLoopResult>();

    const failResult: CritiqueLoopFail = {
      verdict: 'fail',
      iterations: [],
      correction: { summary: '', findings: [], score: 0, iterationCount: 1 },
    };
    expectTypeOf(failResult).toMatchTypeOf<CritiqueLoopResult>();

    const haltedResult: CritiqueLoopHalted = {
      verdict: 'halted',
      iterations: [],
      reason: 'max iterations',
    };
    expectTypeOf(haltedResult).toMatchTypeOf<CritiqueLoopResult>();

    const escalatedResult: CritiqueLoopEscalated = {
      verdict: 'escalated',
      iterations: [],
      escalation: {
        reason: '',
        iterationCount: 0,
        lastCritiqueResults: [],
        taskId: '',
        sessionId: '',
      },
    };
    expectTypeOf(escalatedResult).toMatchTypeOf<CritiqueLoopResult>();
  });

  it('CircuitBreaker has name and check method', () => {
    expectTypeOf<CircuitBreaker>().toHaveProperty('name');
    expectTypeOf<CircuitBreaker>().toHaveProperty('check');
  });

  it('CircuitBreakerResult is a discriminated union on tripped', () => {
    const notTripped: CircuitBreakerResult = { tripped: false };
    const halted: CircuitBreakerResult = {
      tripped: true,
      reason: 'max',
      action: 'halt',
    };
    const escalated: CircuitBreakerResult = {
      tripped: true,
      reason: 'consensus',
      action: 'escalate',
    };
    expectTypeOf(notTripped).toMatchTypeOf<CircuitBreakerResult>();
    expectTypeOf(halted).toMatchTypeOf<CircuitBreakerResult>();
    expectTypeOf(escalated).toMatchTypeOf<CircuitBreakerResult>();
  });

  it('LoopState has iterationCount, iterations, failureHistory', () => {
    expectTypeOf<LoopState>().toHaveProperty('iterationCount');
    expectTypeOf<LoopState>().toHaveProperty('iterations');
    expectTypeOf<LoopState>().toHaveProperty('failureHistory');
  });
});
