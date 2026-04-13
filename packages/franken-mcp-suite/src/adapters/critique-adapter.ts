import {
  ConcisenessEvaluator,
  ComplexityEvaluator,
  LogicLoopEvaluator,
  type Evaluator,
} from '@franken/critique';

export interface CritiqueFinding {
  severity: string;
  message: string;
}

export interface CritiqueEvaluateResult {
  verdict: 'pass' | 'warn' | 'fail';
  score: number;
  findings: CritiqueFinding[];
}

export interface CritiqueCompareResult {
  originalScore: number;
  revisedScore: number;
  delta: number;
  direction: 'improved' | 'degraded' | 'unchanged';
  originalFindings: CritiqueFinding[];
  revisedFindings: CritiqueFinding[];
}

export interface CritiqueAdapter {
  evaluate(input: { content: string; criteria: string[]; evaluators?: string[] }): Promise<CritiqueEvaluateResult>;
  compare(input: { original: string; revised: string }): Promise<CritiqueCompareResult>;
}

export function createCritiqueAdapter(): CritiqueAdapter {
  const evaluatorMap = new Map<string, Evaluator>([
    ['logic-loop', new LogicLoopEvaluator()],
    ['complexity', new ComplexityEvaluator()],
    ['conciseness', new ConcisenessEvaluator()],
  ]);

  return {
    async evaluate(input) {
      const selected = resolveEvaluators(input.evaluators);
      const results = await Promise.all(selected.map((evaluator) =>
        evaluator.evaluate({
          content: input.content,
          metadata: { criteria: input.criteria },
        }),
      ));

      const findings = results.flatMap((result) =>
        result.findings.map((finding) => ({
          severity: String(finding.severity),
          message: finding.message,
        })),
      );

      const score = results.length === 0
        ? 1
        : results.reduce((sum, result) => sum + result.score, 0) / results.length;

      return {
        verdict: findings.some((finding) => finding.severity === 'critical' || finding.severity === 'error')
          ? 'fail'
          : findings.length > 0
            ? 'warn'
            : 'pass',
        score,
        findings,
      };
    },

    async compare(input) {
      const original = await this.evaluate({ content: input.original, criteria: [], evaluators: defaultEvaluators() });
      const revised = await this.evaluate({ content: input.revised, criteria: [], evaluators: defaultEvaluators() });
      const delta = revised.score - original.score;

      return {
        originalScore: original.score,
        revisedScore: revised.score,
        delta,
        direction: delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'unchanged',
        originalFindings: original.findings,
        revisedFindings: revised.findings,
      };
    },
  };

  function resolveEvaluators(names?: string[]) {
    const selected = (names && names.length > 0 ? names : defaultEvaluators())
      .map((name) => evaluatorMap.get(name))
      .filter((evaluator): evaluator is Evaluator => evaluator !== undefined);

    return selected.length > 0 ? selected : [
      new LogicLoopEvaluator(),
      new ComplexityEvaluator(),
      new ConcisenessEvaluator(),
    ];
  }
}

function defaultEvaluators(): string[] {
  return ['logic-loop', 'complexity', 'conciseness'];
}
