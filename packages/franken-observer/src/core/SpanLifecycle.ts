import type { Span } from './types.js'
import type { TokenCounter } from '../cost/TokenCounter.js'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  model?: string
}

export const SpanLifecycle = {
  setMetadata(span: Span, data: Record<string, unknown>): void {
    if (span.status !== 'active') {
      throw new Error(`Cannot set metadata on a ${span.status} span (id: ${span.id})`)
    }
    Object.assign(span.metadata, data)
  },

  addThoughtBlock(span: Span, thought: string): void {
    if (span.status !== 'active') {
      throw new Error(`Cannot add thought block to a ${span.status} span (id: ${span.id})`)
    }
    span.thoughtBlocks.push(thought)
  },

  recordTokenUsage(span: Span, usage: TokenUsage, counter?: TokenCounter): void {
    // Guard span state up front: an ended/error span must not contribute to
    // spend. Checking before touching the counter prevents inactive spans from
    // poisoning totals even though their metadata write would be rejected.
    if (span.status !== 'active') {
      throw new Error(`Cannot record token usage on a ${span.status} span (id: ${span.id})`)
    }
    // Record to the counter next: it validates the token counts and may throw
    // on bad/overflowing input. Doing it before mutating the span keeps the
    // rejection atomic — a rejected record leaves the span untouched.
    if (counter !== undefined && usage.model !== undefined) {
      counter.record({
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })
    }
    const data: Record<string, unknown> = {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
    }
    if (usage.model !== undefined) {
      data['model'] = usage.model
    }
    SpanLifecycle.setMetadata(span, data)
  },
}
