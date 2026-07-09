import type { Span } from './types.js'
import type { TokenCounter } from '../cost/TokenCounter.js'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  model?: string
}

function assertValidTokenDelta(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `SpanLifecycle: ${label} must be a non-negative safe integer, received ${value}`,
    )
  }
}

function safeAddTokenCounts(a: number, b: number): number {
  const sum = a + b
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError(
      `SpanLifecycle: token total ${sum} exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`,
    )
  }
  return sum
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
    assertValidTokenDelta(usage.promptTokens, 'promptTokens')
    assertValidTokenDelta(usage.completionTokens, 'completionTokens')
    const totalTokens = safeAddTokenCounts(usage.promptTokens, usage.completionTokens)

    // Record to the counter next: it may throw if the new model/global totals
    // would overflow. Doing it before mutating the span keeps the rejection
    // atomic — a rejected record leaves the span untouched.
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
      totalTokens,
    }
    if (usage.model !== undefined) {
      data['model'] = usage.model
    }
    SpanLifecycle.setMetadata(span, data)
  },
}
