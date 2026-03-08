import type { ICritiqueModule, CritiqueFinding, CritiqueResult, PlanGraph } from '../deps.js';

export interface EvaluationInput {
  readonly content: string;
  readonly source?: string | undefined;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface EvaluationFinding {
  readonly message: string;
  readonly severity: string;
}

export interface EvaluationResult {
  readonly evaluatorName: string;
  readonly verdict: string;
  readonly score: number;
  readonly findings: readonly EvaluationFinding[];
}

export interface LoopCritiqueResult {
  readonly verdict: string;
  readonly overallScore: number;
  readonly results: readonly EvaluationResult[];
  readonly shortCircuited: boolean;
}

export interface CritiqueIteration {
  readonly index: number;
  readonly input: EvaluationInput;
  readonly result: LoopCritiqueResult;
  readonly completedAt: string;
}

export interface CorrectionRequest {
  readonly summary: string;
  readonly findings: readonly EvaluationFinding[];
  readonly score: number;
  readonly iterationCount: number;
}

export interface EscalationRequest {
  readonly reason: string;
}

export type CritiqueLoopResult =
  | { readonly verdict: 'pass'; readonly iterations: readonly CritiqueIteration[] }
  | { readonly verdict: 'fail'; readonly iterations: readonly CritiqueIteration[]; readonly correction: CorrectionRequest }
  | { readonly verdict: 'halted'; readonly iterations: readonly CritiqueIteration[]; readonly reason: string }
  | { readonly verdict: 'escalated'; readonly iterations: readonly CritiqueIteration[]; readonly escalation: EscalationRequest };

export interface LoopConfig {
  readonly maxIterations: number;
  readonly tokenBudget: number;
  readonly consensusThreshold: number;
  readonly sessionId: string;
  readonly taskId: string;
}

export interface CritiqueLoopPort {
  run(input: EvaluationInput, config: LoopConfig): Promise<CritiqueLoopResult>;
}

export interface CritiquePortAdapterConfig {
  readonly loop: CritiqueLoopPort;
  readonly config: LoopConfig;
  readonly source?: string | undefined;
}

export class CritiquePortAdapter implements ICritiqueModule {
  private readonly loop: CritiqueLoopPort;
  private readonly config: LoopConfig;
  private readonly source?: string | undefined;

  constructor(config: CritiquePortAdapterConfig) {
    this.loop = config.loop;
    this.config = config.config;
    this.source = config.source;
  }

  async reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult> {
    const input: EvaluationInput = {
      content: JSON.stringify(plan),
      source: this.source,
      metadata: {
        taskCount: plan.tasks.length,
        context,
      },
    };

    const loopResult = await this.loop.run(input, this.config);
    return this.mapResult(loopResult);
  }

  private mapResult(loopResult: CritiqueLoopResult): CritiqueResult {
    const lastIteration = loopResult.iterations[loopResult.iterations.length - 1];
    const lastResult = lastIteration?.result;
    const findings = lastResult ? this.mapFindings(lastResult.results) : [];

    if (loopResult.verdict === 'pass') {
      return {
        verdict: 'pass',
        findings,
        score: lastResult?.overallScore ?? 0,
      };
    }

    if (loopResult.verdict === 'fail') {
      const correctionFindings = loopResult.correction.findings.map(finding => ({
        evaluator: 'critique-loop',
        severity: finding.severity,
        message: finding.message,
      }));
      const normalizedFindings = findings.length > 0
        ? findings
        : correctionFindings.length > 0
          ? correctionFindings
          : [{ evaluator: 'critique-loop', severity: 'high', message: loopResult.correction.summary }];
      return {
        verdict: 'fail',
        findings: normalizedFindings,
        score: loopResult.correction.score ?? lastResult?.overallScore ?? 0,
      };
    }

    if (loopResult.verdict === 'halted') {
      return {
        verdict: 'fail',
        findings: [{ evaluator: 'critique-loop', severity: 'high', message: loopResult.reason }],
        score: lastResult?.overallScore ?? 0,
      };
    }

    return {
      verdict: 'fail',
      findings: [{ evaluator: 'critique-loop', severity: 'high', message: loopResult.escalation.reason }],
      score: lastResult?.overallScore ?? 0,
    };
  }

  private mapFindings(results: readonly EvaluationResult[]): CritiqueFinding[] {
    return results.flatMap(result =>
      result.findings.map(finding => ({
        evaluator: result.evaluatorName,
        severity: finding.severity,
        message: finding.message,
      })),
    );
  }
}
