import { describe, it, expect, vi } from 'vitest'
import { TraceContext } from './TraceContext.js'
import { SpanLifecycle } from './SpanLifecycle.js'
import { TokenCounter } from '../cost/TokenCounter.js'
import { LoopDetector } from '../incident/LoopDetector.js'

describe('SpanLifecycle', () => {
  describe('setMetadata()', () => {
    it('attaches arbitrary key-value metadata to a span', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      SpanLifecycle.setMetadata(span, { model: 'claude-opus-4-6', promptTokens: 500 })
      expect(span.metadata['model']).toBe('claude-opus-4-6')
      expect(span.metadata['promptTokens']).toBe(500)
    })

    it('merges additional metadata without overwriting unrelated keys', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      SpanLifecycle.setMetadata(span, { a: 1 })
      SpanLifecycle.setMetadata(span, { b: 2 })
      expect(span.metadata['a']).toBe(1)
      expect(span.metadata['b']).toBe(2)
    })

    it('throws if span is not active', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      expect(() => SpanLifecycle.setMetadata(span, { x: 1 })).toThrow()
    })
  })

  describe('addThoughtBlock()', () => {
    it('appends a thought string to the span', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      SpanLifecycle.addThoughtBlock(span, 'I should call the search tool next')
      expect(span.thoughtBlocks).toHaveLength(1)
      expect(span.thoughtBlocks[0]).toBe('I should call the search tool next')
    })

    it('appends multiple thoughts in order', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      SpanLifecycle.addThoughtBlock(span, 'first')
      SpanLifecycle.addThoughtBlock(span, 'second')
      expect(span.thoughtBlocks).toEqual(['first', 'second'])
    })

    it('throws if span is not active', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      expect(() => SpanLifecycle.addThoughtBlock(span, 'too late')).toThrow()
    })
  })

  describe('recordTokenUsage()', () => {
    it('attaches prompt, completion, and total token counts to metadata', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'llm-call' })
      SpanLifecycle.recordTokenUsage(span, { promptTokens: 200, completionTokens: 150 })
      expect(span.metadata['promptTokens']).toBe(200)
      expect(span.metadata['completionTokens']).toBe(150)
      expect(span.metadata['totalTokens']).toBe(350)
    })

    it('accepts an optional model identifier', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'llm-call' })
      SpanLifecycle.recordTokenUsage(span, { promptTokens: 100, completionTokens: 50, model: 'gpt-4o' })
      expect(span.metadata['model']).toBe('gpt-4o')
    })

    it('feeds a provided TokenCounter when model is present', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'llm-call' })
      const counter = new TokenCounter()
      SpanLifecycle.recordTokenUsage(span, { promptTokens: 300, completionTokens: 100, model: 'claude-sonnet-4-6' }, counter)
      expect(counter.totalsFor('claude-sonnet-4-6').totalTokens).toBe(400)
    })

    it('does not require a TokenCounter — existing behaviour is unchanged', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'llm-call' })
      expect(() =>
        SpanLifecycle.recordTokenUsage(span, { promptTokens: 50, completionTokens: 25 }),
      ).not.toThrow()
    })
  })

  describe('endSpan() + LoopDetector integration', () => {
    it('calls loopDetector.check() with the span name when provided', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'my-step' })
      const detector = new LoopDetector()
      const checkSpy = vi.spyOn(detector, 'check')
      TraceContext.endSpan(span, {}, detector)
      expect(checkSpy).toHaveBeenCalledWith('my-step')
    })

    it('works without a LoopDetector — existing behaviour unchanged', () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      expect(() => TraceContext.endSpan(span)).not.toThrow()
    })

    it('detects a loop through repeated endSpan calls', () => {
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })
      const handler = vi.fn()
      detector.on('loop-detected', handler)

      const trace = TraceContext.createTrace('goal')
      const names = ['a', 'b', 'a', 'b']
      for (const name of names) {
        const span = TraceContext.startSpan(trace, { name })
        TraceContext.endSpan(span, {}, detector)
      }
      expect(handler).toHaveBeenCalledOnce()
    })
  })
})
