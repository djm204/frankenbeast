import { describe, it, expect, vi } from 'vitest'
import { InterruptEmitter } from './InterruptEmitter.js'
import type { InterruptSignal } from './InterruptEmitter.js'

const makeSignal = (overrides?: Partial<InterruptSignal>): InterruptSignal => ({
  traceId: 'trace-abc-123',
  detectedPattern: ['plan', 'search', 'execute'],
  repetitions: 3,
  timestamp: Date.now(),
  ...overrides,
})

describe('InterruptEmitter', () => {
  describe('emit()', () => {
    it('delivers the signal to all registered handlers', () => {
      const emitter = new InterruptEmitter()
      const h1 = vi.fn()
      const h2 = vi.fn()
      emitter.on('interrupt', h1)
      emitter.on('interrupt', h2)

      const signal = makeSignal()
      emitter.emit(signal)

      expect(h1).toHaveBeenCalledOnce()
      expect(h1).toHaveBeenCalledWith(signal)
      expect(h2).toHaveBeenCalledOnce()
    })

    it('is a no-op when no handlers are registered', () => {
      const emitter = new InterruptEmitter()
      expect(() => emitter.emit(makeSignal())).not.toThrow()
    })

    it('does not throw when a handler throws (isolates handler errors)', () => {
      const emitter = new InterruptEmitter()
      emitter.on('interrupt', () => { throw new Error('handler blow-up') })
      expect(() => emitter.emit(makeSignal())).not.toThrow()
    })

    it('still calls remaining handlers after one throws', () => {
      const emitter = new InterruptEmitter()
      const good = vi.fn()
      emitter.on('interrupt', () => { throw new Error('oops') })
      emitter.on('interrupt', good)
      emitter.emit(makeSignal())
      expect(good).toHaveBeenCalledOnce()
    })
  })

  describe('on() / off()', () => {
    it('stops delivering to a removed handler', () => {
      const emitter = new InterruptEmitter()
      const handler = vi.fn()
      emitter.on('interrupt', handler)
      emitter.off('interrupt', handler)
      emitter.emit(makeSignal())
      expect(handler).not.toHaveBeenCalled()
    })

    it('off() is a no-op for a handler that was never registered', () => {
      const emitter = new InterruptEmitter()
      expect(() => emitter.off('interrupt', vi.fn())).not.toThrow()
    })
  })

  describe('InterruptSignal shape', () => {
    it('signal carries traceId, detectedPattern, repetitions, and timestamp', () => {
      const emitter = new InterruptEmitter()
      let received: InterruptSignal | null = null
      emitter.on('interrupt', s => { received = s })

      const signal = makeSignal({ traceId: 'my-trace', repetitions: 4 })
      emitter.emit(signal)

      expect(received).not.toBeNull()
      expect(received!.traceId).toBe('my-trace')
      expect(received!.detectedPattern).toEqual(['plan', 'search', 'execute'])
      expect(received!.repetitions).toBe(4)
      expect(typeof received!.timestamp).toBe('number')
    })
  })

  describe('LoopDetector integration', () => {
    it('can be wired to a LoopDetector to auto-emit on detection', async () => {
      const { LoopDetector } = await import('./LoopDetector.js')
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      const emitter = new InterruptEmitter()
      const handler = vi.fn()
      emitter.on('interrupt', handler)

      const traceId = 'wired-trace'
      detector.on('loop-detected', result => {
        emitter.emit({ traceId, ...result, timestamp: Date.now() })
      })

      for (const name of ['a', 'b', 'a', 'b']) detector.check(name)

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0]![0].traceId).toBe(traceId)
      expect(handler.mock.calls[0]![0].detectedPattern).toEqual(['a', 'b'])
    })
  })
})
