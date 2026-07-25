import { wallClockNow } from '@franken/types'

export type CompactionTriggerReason = 'threshold' | 'manual'

export interface CompactionEvent {
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
  readonly triggerReason: CompactionTriggerReason
  readonly tokensBefore: number
  readonly tokensAfter: number
  readonly timestamp: number
}

export interface CompactionEventQuery {
  readonly sessionId: string
  readonly since?: number
  readonly limit: number
}

export interface CompactionEventAdapter {
  recordCompaction(event: CompactionEvent): Promise<void>
  queryCompactions(query: CompactionEventQuery): Promise<CompactionEvent[]>
  aggregateCompactions(query: { sessionId: string; since: number }): Promise<{
    count: number
    latestAt: number | null
  }>
}

export interface CompactionRate {
  readonly count: number
  readonly windowMs: number
  readonly perHour: number
  readonly latestAt: number | null
}

const DEFAULT_QUERY_LIMIT = 100
const MAX_QUERY_LIMIT = 1_000

export class CompactionMetrics {
  constructor(private readonly adapter: CompactionEventAdapter) {}

  record(event: CompactionEvent): Promise<void> {
    return this.adapter.recordCompaction(event)
  }

  query(sessionId: string, options: { since?: number; limit?: number } = {}): Promise<CompactionEvent[]> {
    const requestedLimit = options.limit ?? DEFAULT_QUERY_LIMIT
    const limit = Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.floor(requestedLimit)))
    return this.adapter.queryCompactions({
      sessionId,
      limit,
      ...(options.since === undefined ? {} : { since: options.since }),
    })
  }

  async compactionRate(sessionId: string, windowMs: number, now = wallClockNow()): Promise<CompactionRate> {
    if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
      throw new RangeError('windowMs must be a positive safe integer')
    }
    const aggregate = await this.adapter.aggregateCompactions({
      sessionId,
      since: now - windowMs,
    })
    return {
      count: aggregate.count,
      windowMs,
      perHour: aggregate.count * (3_600_000 / windowMs),
      latestAt: aggregate.latestAt,
    }
  }
}