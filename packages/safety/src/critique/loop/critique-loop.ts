import type { EvaluationInput, EvaluationFinding } from '../types/evaluation.js';
import type {
  CircuitBreaker,
  LoopConfig,
  LoopState,
  CritiqueIteration,
  CritiqueLoopResult,
  CorrectionRequest,
} from '../types/loop.js';
import type { EscalationRequest } from '../types/contracts.js';
import type { CritiquePipeline } from '../pipeline/critique-pipeline.js';

export class CritiqueLoop {
  private readonly pipeline: CritiquePipeline;
  private readonly breakers: readonly CircuitBreaker[];

  constructor(pipeline: CritiquePipeline, breakers: readonly CircuitBreaker[]) {
    this.pipeline = pipeline;
    this.breakers = breakers;
  }

  async run(input: EvaluationInput, config: LoopConfig): Promise<CritiqueLoopResult> {
    const state: LoopState = {
      iterationCount: 0,
      iterations: [],
      failureHistory: new Map(),
    };

    while (true) {
      // Pre-check: run all circuit breakers
      const breakerResult = this.checkBreakers(state, config);
      if (breakerResult) return breakerResult;

      // Run the evaluation pipeline
      const critiqueResult = await this.pipeline.run(input);
      const iteration: CritiqueIteration = {
        index: state.iterationCount,
        input,
        result: critiqueResult,
        completedAt: new Date().toISOString(),
      };

      state.iterations.push(iteration);
      state.iterationCount++;

      // Pass: return success
      if (critiqueResult.verdict === 'pass') {
        return { verdict: 'pass', iterations: state.iterations };
      }

      // Fail: update failure history
      for (const result of critiqueResult.results) {
        if (result.verdict === 'fail') {
          const current = state.failureHistory.get(result.evaluatorName) ?? 0;
          (state.failureHistory as Map<string, number>).set(result.evaluatorName, current + 1);
        }
      }

      // If this is the last possible iteration, return fail with correction
      // (next iteration's breaker check will halt, so build the correction now)
      if (state.iterationCount >= config.maxIterations) {
        return {
          verdict: 'fail',
          iterations: state.iterations,
          correction: this.buildCorrection(critiqueResult, state.iterationCount),
        };
      }
    }
  }

  private checkBreakers(state: LoopState, config: LoopConfig): CritiqueLoopResult | null {
    for (const breaker of this.breakers) {
      const result = breaker.check(state, config);
      if (result.tripped) {
        if (result.action === 'escalate') {
          return {
            verdict: 'escalated',
            iterations: state.iterations,
            escalation: this.buildEscalation(result.reason, state, config),
          };
        }
        return {
          verdict: 'halted',
          iterations: state.iterations,
          reason: result.reason,
        };
      }
    }
    return null;
  }

  private buildCorrection(
    critiqueResult: { readonly overallScore: number; readonly results: readonly { readonly findings: readonly EvaluationFinding[] }[] },
    iterationCount: number,
  ): CorrectionRequest {
    const allFindings = critiqueResult.results.flatMap((r) => r.findings);
    const summary = allFindings.map((f) => f.message).join('; ');

    return {
      summary: summary || 'Evaluation failed without specific findings',
      findings: allFindings,
      score: critiqueResult.overallScore,
      iterationCount,
    };
  }

  private buildEscalation(reason: string, state: LoopState, config: LoopConfig): EscalationRequest {
    const lastResults = state.iterations.length > 0
      ? state.iterations[state.iterations.length - 1]!.result.results.map((r) => `${r.evaluatorName}: ${r.verdict}`)
      : [];

    return {
      reason,
      iterationCount: state.iterationCount,
      lastCritiqueResults: lastResults,
      taskId: config.taskId,
      sessionId: config.sessionId,
    };
  }
}
