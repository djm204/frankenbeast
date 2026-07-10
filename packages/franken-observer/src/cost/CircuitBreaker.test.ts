import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CircuitBreaker } from './CircuitBreaker.js'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker({ limitUsd: 0.50 })
  })

  describe('check()', () => {
    it('returns { tripped: false } when spend is below the limit', () => {
      const result = breaker.check(0.25)
      expect(result.tripped).toBe(false)
    })

    it('returns { tripped: false } when spend equals the limit exactly', () => {
      const result = breaker.check(0.50)
      expect(result.tripped).toBe(false)
    })

    it('returns { tripped: true } when spend exceeds the limit', () => {
      const result = breaker.check(0.51)
      expect(result.tripped).toBe(true)
    })

    it('includes limitUsd and spendUsd in the result', () => {
      const result = breaker.check(0.75)
      expect(result.limitUsd).toBe(0.50)
      expect(result.spendUsd).toBe(0.75)
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['negative values', -0.01],
    ])('throws RangeError for invalid spendUsd: %s', (_label, spendUsd) => {
      expect(() => breaker.check(spendUsd)).toThrow(RangeError)
      expect(() => breaker.check(spendUsd)).toThrow('spendUsd must be a finite non-negative number')
    })
  })

  describe('HITL event emission', () => {
    it('emits a "limit-reached" event when tripped', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.check(0.51)
      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ tripped: true, limitUsd: 0.50, spendUsd: 0.51 }),
      )
    })

    it('does not emit when under the limit', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.check(0.25)
      expect(handler).not.toHaveBeenCalled()
    })

    it('fires the handler only once while continuously tripped (no alert fatigue)', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.check(0.51)
      breaker.check(0.60)
      expect(handler).toHaveBeenCalledOnce()
    })

    it('re-arms and fires again after spend recovers below the limit', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.check(0.51) // trips, fires
      breaker.check(0.25) // recovers, re-arms
      breaker.check(0.60) // trips again, fires
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('reset() re-arms so the next trip fires again', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.check(0.51) // fires once
      breaker.reset()
      breaker.check(0.60) // fires again after acknowledge
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('reset() does not throw when never tripped', () => {
      expect(() => breaker.reset()).not.toThrow()
    })

    it('supports removing a listener with off()', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.off('limit-reached', handler)
      breaker.check(0.51)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('non-blocking guarantee', () => {
    it('does not throw even when the limit is exceeded', () => {
      expect(() => breaker.check(999)).not.toThrow()
    })

    it('continues returning results after trip', () => {
      breaker.check(1.00)
      const result = breaker.check(2.00)
      expect(result.tripped).toBe(true)
      expect(result.spendUsd).toBe(2.00)
    })
  })

  describe('custom limit', () => {
    it('respects a different limitUsd at construction', () => {
      const strict = new CircuitBreaker({ limitUsd: 0.01 })
      expect(strict.check(0.011).tripped).toBe(true)
      expect(strict.check(0.010).tripped).toBe(false)
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['negative values', -0.01],
    ])('throws RangeError for invalid limitUsd: %s', (_label, limitUsd) => {
      expect(() => new CircuitBreaker({ limitUsd })).toThrow(RangeError)
      expect(() => new CircuitBreaker({ limitUsd })).toThrow('limitUsd must be a finite non-negative number')
    })
  })
})
