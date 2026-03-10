import { describe, it, expect } from 'vitest'
import { ToolCallAccuracyEval } from './ToolCallAccuracy.js'
import { EvalRunner } from '../EvalRunner.js'

const runner = new EvalRunner()

const schema = {
  tool: 'search_web',
  required: ['query'],
  allowed: ['query', 'maxResults', 'language'],
}

describe('ToolCallAccuracyEval', () => {
  const ev = new ToolCallAccuracyEval()

  describe('passing cases', () => {
    it('passes when tool name and all required params match', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'search_web', params: { query: 'latest news' } },
        schema,
      })
      expect(result.status).toBe('pass')
      expect(result.score).toBe(1.0)
    })

    it('passes when optional allowed params are included', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'search_web', params: { query: 'AI', maxResults: 5 } },
        schema,
      })
      expect(result.status).toBe('pass')
    })
  })

  describe('failing cases', () => {
    it('fails when the tool name does not match the schema', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'wrong_tool', params: { query: 'test' } },
        schema,
      })
      expect(result.status).toBe('fail')
      expect(result.reason).toMatch(/tool name/i)
      expect(result.score).toBe(0)
    })

    it('fails when a required param is missing (ghost-param prevention)', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'search_web', params: {} },
        schema,
      })
      expect(result.status).toBe('fail')
      expect(result.reason).toMatch(/missing.*required/i)
      expect(result.details?.['missingParams']).toEqual(['query'])
    })

    it('fails when a ghost param is present (not in allowed list)', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'search_web', params: { query: 'test', hallucinated: 'value' } },
        schema,
      })
      expect(result.status).toBe('fail')
      expect(result.reason).toMatch(/ghost param/i)
      expect(result.details?.['ghostParams']).toEqual(['hallucinated'])
    })

    it('reports multiple ghost params at once', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'search_web', params: { query: 'test', ghost1: 'a', ghost2: 'b' } },
        schema,
      })
      expect(result.details?.['ghostParams']).toEqual(
        expect.arrayContaining(['ghost1', 'ghost2']),
      )
    })

    it('reports both missing required and ghost params when both are present', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'search_web', params: { ghost1: 'a' } },
        schema,
      })
      expect(result.status).toBe('fail')
      expect(result.details?.['missingParams']).toEqual(['query'])
      expect(result.details?.['ghostParams']).toEqual(['ghost1'])
    })
  })

  describe('score', () => {
    it('score is 0 on tool name mismatch regardless of params', async () => {
      const result = await runner.run(ev, {
        actual: { tool: 'other', params: { query: 'test' } },
        schema,
      })
      expect(result.score).toBe(0)
    })

    it('score reflects proportion of correct params when tool name matches', async () => {
      // 1 required present, 0 ghost → pass (score 1.0)
      const good = await runner.run(ev, {
        actual: { tool: 'search_web', params: { query: 'test' } },
        schema,
      })
      expect(good.score).toBe(1.0)

      // 0 required present, 1 ghost → fail (score < 1)
      const bad = await runner.run(ev, {
        actual: { tool: 'search_web', params: { ghost: 'x' } },
        schema,
      })
      expect(bad.score).toBeGreaterThanOrEqual(0)
      expect(bad.score).toBeLessThan(1)
    })
  })
})
