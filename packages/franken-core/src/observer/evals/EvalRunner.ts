import type { Eval, EvalResult } from './types.js'

export class EvalRunner {
  async run<T>(ev: Eval<T>, input: T): Promise<EvalResult> {
    try {
      return await Promise.resolve(ev.run(input))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        evalName: ev.name,
        status: 'fail',
        reason: `Eval threw an unexpected error: ${message}`,
      }
    }
  }

  async runAll<T>(evals: Eval<T>[], input: T): Promise<EvalResult[]> {
    const results: EvalResult[] = []
    for (const ev of evals) {
      results.push(await this.run(ev, input))
    }
    return results
  }
}
