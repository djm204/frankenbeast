import { describe, it, expect, vi } from 'vitest'
import { EvalRunner } from './EvalRunner.js'
import type { Eval, EvalResult } from './types.js'

const passingEval: Eval<string> = {
  name: 'always-pass',
  run: (_input) => ({ evalName: 'always-pass', status: 'pass', score: 1.0 }),
}

const failingEval: Eval<string> = {
  name: 'always-fail',
  run: (_input) => ({ evalName: 'always-fail', status: 'fail', score: 0.0, reason: 'bad output' }),
}

const asyncEval: Eval<string> = {
  name: 'async-eval',
  run: async (_input) => ({ evalName: 'async-eval', status: 'pass', score: 1.0 }),
}

const throwingEval: Eval<string> = {
  name: 'throwing-eval',
  run: (_input) => { throw new Error('eval exploded') },
}

describe('EvalRunner', () => {
  const runner = new EvalRunner()

  describe('run()', () => {
    it('returns the result from the eval', async () => {
      const result = await runner.run(passingEval, 'input')
      expect(result.status).toBe('pass')
      expect(result.evalName).toBe('always-pass')
      expect(result.score).toBe(1.0)
    })

    it('handles async evals', async () => {
      const result = await runner.run(asyncEval, 'input')
      expect(result.status).toBe('pass')
    })

    it('catches eval errors and returns a fail result with the error message', async () => {
      const result = await runner.run(throwingEval, 'input')
      expect(result.status).toBe('fail')
      expect(result.evalName).toBe('throwing-eval')
      expect(result.reason).toContain('eval exploded')
    })

    it('calls the eval run method with the provided input', async () => {
      const spy = vi.fn((_: string): EvalResult => ({ evalName: 'spy', status: 'pass' }))
      const spyEval: Eval<string> = { name: 'spy', run: spy }
      await runner.run(spyEval, 'my-input')
      expect(spy).toHaveBeenCalledWith('my-input')
    })
  })

  describe('runAll()', () => {
    it('returns a result for each eval in order', async () => {
      const results = await runner.runAll([passingEval, failingEval], 'input')
      expect(results).toHaveLength(2)
      expect(results[0]!.status).toBe('pass')
      expect(results[1]!.status).toBe('fail')
    })

    it('continues past a throwing eval and records the failure', async () => {
      const results = await runner.runAll([passingEval, throwingEval, passingEval], 'input')
      expect(results).toHaveLength(3)
      expect(results[0]!.status).toBe('pass')
      expect(results[1]!.status).toBe('fail')
      expect(results[1]!.reason).toContain('eval exploded')
      expect(results[2]!.status).toBe('pass')
    })

    it('returns an empty array for an empty eval list', async () => {
      const results = await runner.runAll([], 'input')
      expect(results).toEqual([])
    })
  })
})
