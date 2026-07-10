import { now as deterministicNow } from '@franken/types';
export type SpanStatus = 'active' | 'completed' | 'error'
export type TraceStatus = 'active' | 'completed' | 'error'

export interface Span {
  id: string
  traceId: string
  parentSpanId?: string
  name: string
  status: SpanStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  errorMessage?: string
  metadata: Record<string, unknown>
  thoughtBlocks: string[]
}

export interface Trace {
  id: string
  goal: string
  status: TraceStatus
  startedAt: number
  endedAt?: number
  spans: Span[]
}

export interface StartSpanOptions {
  name: string
  parentSpanId?: string
}

export interface EndSpanOptions {
  status?: 'completed' | 'error'
  errorMessage?: string
}

export interface TraceValidationIssue {
  type: 'active-span'
  spanId: string
  spanName: string
  ageMs: number
  message: string
  autoClosed?: true
}

export interface TraceValidationOptions {
  /** Clock override for deterministic tests. Defaults to deterministicNow(). */
  now?: number
  /**
   * When set, active spans older than this threshold are considered timed out.
   * Detection still reports all active spans; auto-close only applies to timed-out spans.
   */
  activeSpanTimeoutMs?: number
  /** Mark timed-out active spans as error instead of only reporting them. */
  autoCloseTimedOutSpans?: boolean
}

export interface TraceValidationResult {
  ok: boolean
  issues: TraceValidationIssue[]
}
