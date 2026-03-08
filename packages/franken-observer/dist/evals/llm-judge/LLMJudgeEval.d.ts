import type { Eval, EvalResult } from '../types.js';
export interface JudgeResponse {
    /** Confidence score 0–1. */
    score: number;
    /** Human-readable explanation. */
    reason: string;
}
/**
 * A function that receives a prompt string and returns a scored judgement.
 * In production this calls an LLM (e.g. Claude). In tests, it is mocked.
 */
export type JudgeFunction = (prompt: string) => Promise<JudgeResponse>;
export interface LLMJudgeEvalOptions<TInput> {
    name: string;
    /** Converts the raw eval input into the prompt sent to the judge LLM. */
    buildPrompt(input: TInput): string;
    judge: JudgeFunction;
    /** Score at or above which the eval is considered passing. Default 0.7. */
    passThreshold?: number;
}
/**
 * LLM-as-a-Judge eval. Uses a configurable judge function so the eval
 * can be run in tests with a mock, and in production with a real LLM.
 * The EvalRunner catches errors, but LLMJudgeEval also handles judge
 * errors explicitly to produce informative failure messages.
 */
export declare class LLMJudgeEval<TInput = string> implements Eval<TInput> {
    readonly name: string;
    private readonly buildPrompt;
    private readonly judge;
    private readonly passThreshold;
    constructor(options: LLMJudgeEvalOptions<TInput>);
    run(input: TInput): Promise<EvalResult>;
}
//# sourceMappingURL=LLMJudgeEval.d.ts.map