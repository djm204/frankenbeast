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

    it('emits on every call that exceeds the limit (not just the first)', () => {
      const handler = vi.fn()
      breaker.on('limit-reached', handler)
      breaker.check(0.51)
      breaker.check(0.60)
      expect(handler).toHaveBeenCalledTimes(2)
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
  })
})
