import type { Evaluator, EvaluationInput, EvaluationResult, CritiquePipelineResult } from '../types/evaluation.js';

const SAFETY_EVALUATOR_NAME = 'safety';

function hasWarningFinding(result: EvaluationResult): boolean {
  return result.findings.some((finding) => finding.severity !== 'info');
}

export class CritiquePipeline {
  private readonly evaluators: readonly Evaluator[];

  constructor(evaluators: readonly Evaluator[]) {
    // Sort: deterministic first, then heuristic
    this.evaluators = [...evaluators].sort((a, b) => {
      if (a.category === b.category) return 0;
      return a.category === 'deterministic' ? -1 : 1;
    });
  }

  async run(input: EvaluationInput): Promise<CritiquePipelineResult> {
    if (this.evaluators.length === 0) {
      return { verdict: 'pass', overallScore: 1, results: [], shortCircuited: false };
    }

    const results: EvaluationResult[] = [];
    let shortCircuited = false;

    for (const evaluator of this.evaluators) {
      const result = await evaluator.evaluate(input);
      results.push(result);

      // Short-circuit on safety failure
      if (evaluator.name === SAFETY_EVALUATOR_NAME && result.verdict === 'fail') {
        shortCircuited = true;
        break;
      }
    }

    const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const hasFailure = results.some((r) => r.verdict === 'fail');
    const hasWarning = results.some(
      (r) => r.verdict === 'warn' || (r.verdict === 'pass' && hasWarningFinding(r)),
    );

    return {
      verdict: hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass',
      overallScore,
      results,
      shortCircuited,
    };
  }
}
