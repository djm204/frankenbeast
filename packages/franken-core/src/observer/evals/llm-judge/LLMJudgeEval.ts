import type { Eval, EvalResult } from '../types.js'

export interface JudgeResponse {
  /** Confidence score 0–1. */
  score: number
  /** Human-readable explanation. */
  reason: string
}

/**
 * A function that receives a prompt string and returns a scored judgement.
 * In production this calls an LLM (e.g. Claude). In tests, it is mocked.
 */
export type JudgeFunction = (prompt: string) => Promise<JudgeResponse>

export interface LLMJudgeEvalOptions<TInput> {
  name: string
  /** Converts the raw eval input into the prompt sent to the judge LLM. */
  buildPrompt(input: TInput): string
  judge: JudgeFunction
  /** Score at or above which the eval is considered passing. Default 0.7. */
  passThreshold?: number
}

/**
 * LLM-as-a-Judge eval. Uses a configurable judge function so the eval
 * can be run in tests with a mock, and in production with a real LLM.
 * The EvalRunner catches errors, but LLMJudgeEval also handles judge
 * errors explicitly to produce informative failure messages.
 */
export class LLMJudgeEval<TInput = string> implements Eval<TInput> {
  readonly name: string
  private readonly buildPrompt: (input: TInput) => string
  private readonly judge: JudgeFunction
  private readonly passThreshold: number

  constructor(options: LLMJudgeEvalOptions<TInput>) {
    this.name = options.name
    this.buildPrompt = options.buildPrompt
    this.judge = options.judge
    this.passThreshold = options.passThreshold ?? 0.7
  }

  async run(input: TInput): Promise<EvalResult> {
    const prompt = this.buildPrompt(input)
    let response: JudgeResponse
    try {
      response = await this.judge(prompt)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        evalName: this.name,
        status: 'fail',
        reason: `Judge function failed: ${message}`,
      }
    }

    const status = response.score >= this.passThreshold ? 'pass' : 'fail'
    return {
      evalName: this.name,
      status,
      score: response.score,
      reason: response.reason,
    }
  }
}
