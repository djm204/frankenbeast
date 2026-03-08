import { describe, it, expect, beforeEach } from 'vitest'
import { TokenCounter } from './TokenCounter.js'

describe('TokenCounter', () => {
  let counter: TokenCounter

  beforeEach(() => {
    counter = new TokenCounter()
  })

  describe('record()', () => {
    it('accumulates prompt and completion tokens for a model', () => {
      counter.record({ model: 'claude-opus-4-6', promptTokens: 200, completionTokens: 100 })
      const totals = counter.totalsFor('claude-opus-4-6')
      expect(totals.promptTokens).toBe(200)
      expect(totals.completionTokens).toBe(100)
      expect(totals.totalTokens).toBe(300)
    })

    it('accumulates across multiple calls for the same model', () => {
      counter.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50 })
      counter.record({ model: 'claude-opus-4-6', promptTokens: 300, completionTokens: 150 })
      const totals = counter.totalsFor('claude-opus-4-6')
      expect(totals.promptTokens).toBe(400)
      expect(totals.completionTokens).toBe(200)
      expect(totals.totalTokens).toBe(600)
    })

    it('tracks multiple models independently', () => {
      counter.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50 })
      counter.record({ model: 'gpt-4o', promptTokens: 200, completionTokens: 80 })
      expect(counter.totalsFor('claude-opus-4-6').totalTokens).toBe(150)
      expect(counter.totalsFor('gpt-4o').totalTokens).toBe(280)
    })
  })

  describe('totalsFor()', () => {
    it('returns zero counts for an unknown model', () => {
      const totals = counter.totalsFor('unknown-model')
      expect(totals.promptTokens).toBe(0)
      expect(totals.completionTokens).toBe(0)
      expect(totals.totalTokens).toBe(0)
    })
  })

  describe('grandTotal()', () => {
    it('sums tokens across all models', () => {
      counter.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50 })
      counter.record({ model: 'gpt-4o', promptTokens: 200, completionTokens: 80 })
      const grand = counter.grandTotal()
      expect(grand.promptTokens).toBe(300)
      expect(grand.completionTokens).toBe(130)
      expect(grand.totalTokens).toBe(430)
    })

    it('returns zero totals when no tokens have been recorded', () => {
      const grand = counter.grandTotal()
      expect(grand.totalTokens).toBe(0)
    })
  })

  describe('allModels()', () => {
    it('returns the list of models seen so far', () => {
      counter.record({ model: 'claude-opus-4-6', promptTokens: 1, completionTokens: 1 })
      counter.record({ model: 'gpt-4o', promptTokens: 1, completionTokens: 1 })
      expect(counter.allModels()).toEqual(expect.arrayContaining(['claude-opus-4-6', 'gpt-4o']))
      expect(counter.allModels()).toHaveLength(2)
    })
  })

  describe('reset()', () => {
    it('clears all accumulated counts', () => {
      counter.record({ model: 'claude-opus-4-6', promptTokens: 100, completionTokens: 50 })
      counter.reset()
      expect(counter.grandTotal().totalTokens).toBe(0)
      expect(counter.allModels()).toHaveLength(0)
    })
  })
})
