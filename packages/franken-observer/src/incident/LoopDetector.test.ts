import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoopDetector } from './LoopDetector.js'

describe('LoopDetector', () => {
  describe('default options (windowSize=3, repeatThreshold=3)', () => {
    let detector: LoopDetector

    beforeEach(() => {
      detector = new LoopDetector()
    })

    it('does not detect a loop with fewer spans than windowSize × repeatThreshold', () => {
      const result = detector.check('plan')
      expect(result.detected).toBe(false)
    })

    it('detects a repeating 3-span pattern after 9 spans', () => {
      // Repeat ['plan','search','execute'] 3 times
      for (const name of ['plan', 'search', 'execute', 'plan', 'search', 'execute', 'plan', 'search']) {
        expect(detector.check(name).detected).toBe(false)
      }
      const result = detector.check('execute')
      expect(result.detected).toBe(true)
      expect(result.detectedPattern).toEqual(['plan', 'search', 'execute'])
      expect(result.repetitions).toBe(3)
    })

    it('does not detect when the sequence is not a clean repetition', () => {
      for (const name of ['plan', 'search', 'execute', 'plan', 'search', 'execute', 'plan', 'search']) {
        detector.check(name)
      }
      // Break the pattern on the 9th span
      const result = detector.check('summarise')
      expect(result.detected).toBe(false)
    })

    it('continues detecting on every subsequent repeating span after initial detection', () => {
      for (const name of ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c']) {
        detector.check(name)
      }
      // 10th span continues the loop
      detector.check('a')
      const result = detector.check('b')
      // Now 11 spans: pattern ['a','b','c'] repeated 3+ times in last 9
      expect(result.detected).toBe(true)
    })
  })

  describe('custom options', () => {
    it('respects a custom windowSize', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 3 })
      // Need ['x','y'] repeated 3 times = 6 spans
      for (const name of ['x', 'y', 'x', 'y', 'x']) {
        expect(detector.check(name).detected).toBe(false)
      }
      const result = detector.check('y')
      expect(result.detected).toBe(true)
      expect(result.detectedPattern).toEqual(['x', 'y'])
    })

    it('respects a custom repeatThreshold', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      // Need ['a','b'] repeated 2 times = 4 spans
      for (const name of ['a', 'b', 'a']) {
        expect(detector.check(name).detected).toBe(false)
      }
      const result = detector.check('b')
      expect(result.detected).toBe(true)
      expect(result.repetitions).toBe(2)
    })
  })

  describe('event emission', () => {
    it('emits a loop-detected event when a loop is found', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      const handler = vi.fn()
      detector.on('loop-detected', handler)

      detector.check('a')
      detector.check('b')
      detector.check('a')
      expect(handler).not.toHaveBeenCalled()

      detector.check('b') // triggers
      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ detected: true, detectedPattern: ['a', 'b'], repetitions: 2 }),
      )
    })

    it('does not emit when no loop is detected', () => {
      const detector = new LoopDetector()
      const handler = vi.fn()
      detector.on('loop-detected', handler)
      detector.check('step-1')
      detector.check('step-2')
      expect(handler).not.toHaveBeenCalled()
    })

    it('supports removing a listener with off()', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      const handler = vi.fn()
      detector.on('loop-detected', handler)
      detector.off('loop-detected', handler)
      for (const n of ['a', 'b', 'a', 'b']) detector.check(n)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('reset()', () => {
    it('clears history so detection starts fresh', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      for (const n of ['a', 'b', 'a']) detector.check(n)
      detector.reset()
      // After reset 'b' is only the 1st span, no loop
      const result = detector.check('b')
      expect(result.detected).toBe(false)
    })
  })
})
