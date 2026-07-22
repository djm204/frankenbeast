import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  CritiquePipelineResult,
} from '../types/evaluation.js';
import { createScore } from '../types/common.js';
import { ConfigurationError } from '../errors/index.js';

const SAFETY_EVALUATOR_NAME = 'safety';

function hasWarningFinding(result: EvaluationResult): boolean {
  return result.findings.some((finding) => finding.severity !== 'info');
}

function logEvaluatorException(evaluator: Evaluator, error: unknown): void {
  console.warn('Critique evaluator threw during evaluation', {
    evaluatorName: evaluator.name,
    error,
  });
}

function createEvaluatorExceptionResult(
  evaluator: Evaluator,
): EvaluationResult {
  return {
    evaluatorName: evaluator.name,
    verdict: 'fail',
    score: createScore(0),
    findings: [
      {
        message: `Evaluator "${evaluator.name}" failed because an internal evaluator error occurred.`,
        severity: 'critical',
        location: EVALUATOR_EXCEPTION_LOCATION,
        suggestion:
          'Inspect trusted evaluator logs or dependencies before retrying the critique run.',
      },
    ],
  };
}

export interface CritiquePipelineRunOptions {
  /** Optional allowlist of registered evaluator names to run. */
  readonly evaluatorNames?: readonly string[] | undefined;
}

export class UnknownEvaluatorError extends ConfigurationError {
  readonly evaluatorNames: readonly string[];

  constructor(evaluatorNames: readonly string[]) {
    super(`Unknown evaluator selection: ${evaluatorNames.join(', ')}`, {
      context: { evaluatorNames },
    });
    this.name = 'UnknownEvaluatorError';
    this.evaluatorNames = evaluatorNames;
  }
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

  async run(
    input: EvaluationInput,
    options: CritiquePipelineRunOptions = {},
  ): Promise<CritiquePipelineResult> {
    const selectedNames = options.evaluatorNames;
    const hasSelector = selectedNames !== undefined && selectedNames.length > 0;
    if (hasSelector) {
      const registeredNames = new Set(
        this.evaluators.map((evaluator) => evaluator.name),
      );
      const unknownNames = [
        ...new Set(selectedNames.filter((name) => !registeredNames.has(name))),
      ];
      if (unknownNames.length > 0) {
        throw new UnknownEvaluatorError(unknownNames);
      }
    }
    const evaluators = hasSelector
      ? this.evaluators.filter((evaluator) =>
          selectedNames.includes(evaluator.name),
        )
      : this.evaluators;

    if (evaluators.length === 0) {
      return {
        verdict: 'pass',
        overallScore: createScore(1),
        results: [],
        shortCircuited: false,
      };
    }

    const results: EvaluationResult[] = [];
    let shortCircuited = false;

    for (const evaluator of evaluators) {
      let result: EvaluationResult;

      try {
        result = await evaluator.evaluate(input);
      } catch (error) {
        logEvaluatorException(evaluator, error);
        results.push(createEvaluatorExceptionResult(evaluator));
        if (evaluator.name === SAFETY_EVALUATOR_NAME) {
          shortCircuited = true;
          break;
        }
        continue;
      }

      results.push(result);

      // Short-circuit on safety failure
      if (
        evaluator.name === SAFETY_EVALUATOR_NAME &&
        result.verdict === 'fail'
      ) {
        shortCircuited = true;
        break;
      }
    }

    const overallScore = createScore(
      results.reduce((sum, r) => sum + r.score, 0) / results.length,
    );
    const hasFailure = results.some((r) => r.verdict === 'fail');
    const hasWarning = results.some(
      (r) =>
        r.verdict === 'warn' || (r.verdict === 'pass' && hasWarningFinding(r)),
    );

    return {
      verdict: hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass',
      overallScore,
      results,
      shortCircuited,
    };
  }
}
