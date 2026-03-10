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
    const data: Record<string, unknown> = {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
    }
    if (usage.model !== undefined) {
      data['model'] = usage.model
    }
    SpanLifecycle.setMetadata(span, data)
    if (counter !== undefined && usage.model !== undefined) {
      counter.record({
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })
    }
  },
}
