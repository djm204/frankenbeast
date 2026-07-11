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

  describe('option validation', () => {
    it.each([
      ['windowSize', { windowSize: 0 }],
      ['windowSize', { windowSize: -1 }],
      ['windowSize', { windowSize: 1.5 }],
      ['windowSize', { windowSize: Number.NaN }],
      ['repeatThreshold', { repeatThreshold: 0 }],
      ['repeatThreshold', { repeatThreshold: -1 }],
      ['repeatThreshold', { repeatThreshold: 1.5 }],
      ['repeatThreshold', { repeatThreshold: Number.POSITIVE_INFINITY }],
      ['historyLimit', { historyLimit: 0 }],
      ['historyLimit', { historyLimit: -1 }],
      ['historyLimit', { historyLimit: 1.5 }],
      ['historyLimit', { historyLimit: Number.NaN }],
    ])('rejects invalid positive integer option %s=%j', (optionName, options) => {
      expect(() => new LoopDetector(options)).toThrow(new RangeError(`${optionName} must be a finite positive integer`))
    })

    it.each([
      ['maxGapBetweenRepetitions', { maxGapBetweenRepetitions: -1 }],
      ['maxGapBetweenRepetitions', { maxGapBetweenRepetitions: 1.5 }],
      ['maxGapBetweenRepetitions', { maxGapBetweenRepetitions: Number.NaN }],
    ])('rejects invalid non-negative integer option %s=%j', (optionName, options) => {
      expect(() => new LoopDetector(options)).toThrow(
        new RangeError(`${optionName} must be a finite non-negative integer`),
      )
    })

    it.each([
      ['similarityThreshold', { similarityThreshold: -0.01 }],
      ['similarityThreshold', { similarityThreshold: 1.01 }],
      ['similarityThreshold', { similarityThreshold: Number.NaN }],
      ['similarityThreshold', { similarityThreshold: Number.POSITIVE_INFINITY }],
    ])('rejects invalid threshold option %s=%j', (optionName, options) => {
      expect(() => new LoopDetector(options)).toThrow(new RangeError(`${optionName} must be a finite number between 0 and 1`))
    })

    it('allows zero maxGapBetweenRepetitions and threshold bounds', () => {
      expect(() => new LoopDetector({ maxGapBetweenRepetitions: 0, similarityThreshold: 0 })).not.toThrow()
      expect(() => new LoopDetector({ similarityThreshold: 1 })).not.toThrow()
    })

    it('rejects windowSize 0 before it can emit an empty detected pattern', () => {
      expect(() => new LoopDetector({ windowSize: 0, repeatThreshold: 3 })).toThrow(RangeError)
    })
  })

  describe('varied repetition patterns', () => {
    it('detects fuzzy span-name repetitions with volatile metadata differences', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 3 })

      for (const name of [
        'tool:search duration=101ms',
        'tool:execute tokens=504',
        'tool:search duration=117ms',
        'tool:execute tokens=512',
        'tool:search duration=124ms',
      ]) {
        expect(detector.check(name).detected).toBe(false)
      }

      const result = detector.check('tool:execute tokens=521')
      expect(result.detected).toBe(true)
      expect(result.detectedPattern).toEqual(['tool:search duration=101ms', 'tool:execute tokens=504'])
      expect(result.repetitions).toBe(3)
    })

    it('detects repeated patterns separated by small gaps in history', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 3 })

      for (const name of ['plan', 'execute', 'heartbeat', 'plan', 'execute', 'retry-wait', 'plan']) {
        expect(detector.check(name).detected).toBe(false)
      }

      const result = detector.check('execute')
      expect(result.detected).toBe(true)
      expect(result.detectedPattern).toEqual(['plan', 'execute'])
      expect(result.repetitions).toBe(3)
    })
  })

  describe('ordinal progressions are not loops', () => {
    it('does not flag a normal incrementing iteration counter as a loop', () => {
      // Mirrors the CLI executor span naming cli:<chunk>:iter-<n> over a normal
      // 9-iteration run under the default detector.
      const detector = new LoopDetector()
      let detected = false
      for (let i = 1; i <= 9; i += 1) {
        detected = detector.check(`cli:chunk-a:iter-${i}`).detected || detected
      }
      expect(detected).toBe(false)
    })

    it('does not collapse hyphenated ordinal step names', () => {
      const detector = new LoopDetector({ windowSize: 1, repeatThreshold: 3 })
      for (const n of ['step-1', 'step-2']) {
        expect(detector.check(n).detected).toBe(false)
      }
      expect(detector.check('step-3').detected).toBe(false)
    })
  })

  describe('history retention for large windows', () => {
    it('still detects loops when windowSize × repeatThreshold exceeds the default historyLimit', () => {
      const detector = new LoopDetector({ windowSize: 50, repeatThreshold: 3 })
      const pattern = Array.from({ length: 50 }, (_, i) => `span-${i}-fixed`)
      let result = { detected: false } as ReturnType<typeof detector.check>
      // Feed the 50-span pattern three times (150 spans > default 100 limit).
      for (let rep = 0; rep < 3; rep += 1) {
        for (const name of pattern) {
          result = detector.check(name)
        }
      }
      expect(result.detected).toBe(true)
      expect(result.repetitions).toBe(3)
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

    it('isolates throwing handlers and continues notifying later listeners', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      const throwingHandler = vi.fn(() => {
        throw new Error('webhook failed')
      })
      const laterHandler = vi.fn()

      detector.on('loop-detected', throwingHandler)
      detector.on('loop-detected', laterHandler)

      detector.check('a')
      detector.check('b')
      detector.check('a')

      expect(() => detector.check('b')).not.toThrow()
      expect(throwingHandler).toHaveBeenCalledOnce()
      expect(laterHandler).toHaveBeenCalledOnce()
      expect(laterHandler).toHaveBeenCalledWith(
        expect.objectContaining({ detected: true, detectedPattern: ['a', 'b'], repetitions: 2 }),
      )
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
