import type { Score, Severity, Verdict } from './common.js';
/** The input provided to evaluators for review. */
export interface EvaluationInput {
    /** The code or plan content to evaluate. */
    readonly content: string;
    /** Optional file path or identifier for the content. */
    readonly source?: string | undefined;
    /** Additional context (e.g., project ID, language). */
    readonly metadata: Readonly<Record<string, unknown>>;
}
/** A single finding from an evaluator. */
export interface EvaluationFinding {
    /** Human-readable description of the issue. */
    readonly message: string;
    /** Severity of this finding. */
    readonly severity: Severity;
    /** Optional line number or range reference. */
    readonly location?: string | undefined;
    /** Actionable suggestion to fix the issue. */
    readonly suggestion?: string | undefined;
}
/** Result from a single evaluator run. */
export interface EvaluationResult {
    /** Name of the evaluator that produced this result. */
    readonly evaluatorName: string;
    /** Pass or fail verdict. */
    readonly verdict: Verdict;
    /** Normalized score (0-1). */
    readonly score: Score;
    /** List of findings (empty on pass). */
    readonly findings: readonly EvaluationFinding[];
}
/** Aggregated result from all evaluators in the pipeline. */
export interface CritiqueResult {
    /** Overall verdict (fail if any evaluator fails). */
    readonly verdict: Verdict;
    /** Average score across all evaluators. */
    readonly overallScore: Score;
    /** Individual evaluator results. */
    readonly results: readonly EvaluationResult[];
    /** Whether evaluation was short-circuited (e.g., safety failure). */
    readonly shortCircuited: boolean;
}
/** An evaluator that can assess code or plans. */
export interface Evaluator {
    /** Unique name for this evaluator. */
    readonly name: string;
    /** Whether this evaluator is deterministic or heuristic. */
    readonly category: 'deterministic' | 'heuristic';
    /** Run the evaluation and return a result. */
    evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
//# sourceMappingURL=evaluation.d.ts.map