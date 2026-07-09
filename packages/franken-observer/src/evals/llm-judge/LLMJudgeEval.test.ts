import { describe, it, expect, vi } from 'vitest'
import { LLMJudgeEval } from './LLMJudgeEval.js'
import type { JudgeFunction } from './LLMJudgeEval.js'
import { EvalRunner } from '../EvalRunner.js'

const runner = new EvalRunner()

function mockJudge(score: number, reason = 'mock reason'): JudgeFunction {
  return vi.fn(async (_prompt: string) => ({ score, reason }))
}

describe('LLMJudgeEval', () => {
  describe('pass / fail threshold', () => {
    it('passes when judge score meets the default threshold (0.7)', async () => {
      const ev = new LLMJudgeEval({
        name: 'quality-check',
        buildPrompt: (input) => `Rate this: ${input}`,
        judge: mockJudge(0.8),
      })
      const result = await runner.run(ev, 'excellent output')
      expect(result.status).toBe('pass')
      expect(result.score).toBe(0.8)
    })

    it('fails when judge score is below the default threshold', async () => {
      const ev = new LLMJudgeEval({
        name: 'quality-check',
        buildPrompt: (input) => `Rate this: ${input}`,
        judge: mockJudge(0.5),
      })
      const result = await runner.run(ev, 'poor output')
      expect(result.status).toBe('fail')
      expect(result.score).toBe(0.5)
    })

    it('uses a custom passThreshold when provided', async () => {
      const ev = new LLMJudgeEval({
        name: 'strict-check',
        buildPrompt: (input) => `Rate: ${input}`,
        judge: mockJudge(0.75),
        passThreshold: 0.9,
      })
      const result = await runner.run(ev, 'decent output')
      expect(result.status).toBe('fail')
    })

    it('passes at exactly the threshold', async () => {
      const ev = new LLMJudgeEval({
        name: 'edge-case',
        buildPrompt: (input) => input,
        judge: mockJudge(0.7),
        passThreshold: 0.7,
      })
      const result = await runner.run(ev, 'borderline')
      expect(result.status).toBe('pass')
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['negative', -0.1],
      ['greater than 1', 1.1],
    ])('throws RangeError for invalid passThreshold %s', (_label, passThreshold) => {
      expect(
        () =>
          new LLMJudgeEval({
            name: 'invalid-threshold',
            buildPrompt: (input) => input,
            judge: mockJudge(0.8),
            passThreshold,
          }),
      ).toThrow(RangeError)
    })
  })

  describe('judge score validation', () => {
    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['negative', -0.1],
      ['greater than 1', 1.1],
    ])('returns an explicit failure for invalid judge score %s', async (_label, score) => {
      const ev = new LLMJudgeEval({
        name: 'invalid-score',
        buildPrompt: (input) => input,
        judge: mockJudge(score),
      })

      const result = await runner.run(ev, 'input')

      expect(result).toMatchObject({
        evalName: 'invalid-score',
        status: 'fail',
        reason: 'Judge returned invalid score: expected a finite number between 0 and 1',
      })
      expect(result.score).toBeUndefined()
    })
  })

  describe('prompt building', () => {
    it('passes the built prompt to the judge function', async () => {
      const judgeSpy = mockJudge(1.0)
      const ev = new LLMJudgeEval({
        name: 'prompt-test',
        buildPrompt: (input: string) => `JUDGE THIS: ${input}`,
        judge: judgeSpy,
      })
      await runner.run(ev, 'my text')
      expect(judgeSpy).toHaveBeenCalledWith('JUDGE THIS: my text')
    })
  })

  describe('result fields', () => {
    it('includes the judge reason in the result', async () => {
      const ev = new LLMJudgeEval({
        name: 'reason-test',
        buildPrompt: (i) => i,
        judge: mockJudge(0.9, 'Well structured and accurate'),
      })
      const result = await runner.run(ev, 'input')
      expect(result.reason).toBe('Well structured and accurate')
    })

    it('includes evalName matching the configured name', async () => {
      const ev = new LLMJudgeEval({
        name: 'my-judge-eval',
        buildPrompt: (i) => i,
        judge: mockJudge(1.0),
      })
      const result = await runner.run(ev, 'input')
      expect(result.evalName).toBe('my-judge-eval')
    })
  })

  describe('error handling', () => {
    it('returns a fail result when the judge function throws', async () => {
      const failingJudge: JudgeFunction = vi.fn(async () => {
        throw new Error('LLM unavailable')
      })
      const ev = new LLMJudgeEval({
        name: 'error-test',
        buildPrompt: (i) => i,
        judge: failingJudge,
      })
      const result = await runner.run(ev, 'input')
      expect(result.status).toBe('fail')
      expect(result.reason).toContain('LLM unavailable')
    })
  })
})
