import type { Trace, Span } from '../core/types.js'

// ── OTEL-shaped output types ──────────────────────────────────────────────────

export interface OTELAttributeValue {
  stringValue?: string
  intValue?: number
  doubleValue?: number
  boolValue?: boolean
}

export interface OTELAttribute {
  key: string
  value: OTELAttributeValue
}

export interface OTELStatus {
  code: 'UNSET' | 'OK' | 'ERROR'
  message?: string
}

export interface OTELSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startTimeUnixNano: number
  endTimeUnixNano: number
  attributes: OTELAttribute[]
  status: OTELStatus
}

export interface OTELScopeSpans {
  scope: { name: string }
  spans: OTELSpan[]
}

export interface OTELResourceSpans {
  resource: { attributes: OTELAttribute[] }
  scopeSpans: OTELScopeSpans[]
}

export interface OTELPayload {
  resourceSpans: OTELResourceSpans[]
}

// ── Serialiser ────────────────────────────────────────────────────────────────

function toAttributeValue(v: unknown): OTELAttributeValue {
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { boolValue: v }
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { intValue: v } : { doubleValue: v }
  }
  return { stringValue: String(v) }
}

function metadataToAttributes(metadata: Record<string, unknown>): OTELAttribute[] {
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: toAttributeValue(value),
  }))
}

function spanStatus(span: Span): OTELStatus {
  if (span.status === 'error') {
    return { code: 'ERROR', message: span.errorMessage }
  }
  return { code: 'OK' }
}

function serializeSpan(span: Span): OTELSpan {
  const attributes: OTELAttribute[] = metadataToAttributes(span.metadata)

  if (span.thoughtBlocks.length > 0) {
    attributes.push({
      key: 'thoughtBlocks',
      value: { stringValue: span.thoughtBlocks.join('\n') },
    })
  }

  return {
    traceId: span.traceId,
    spanId: span.id,
    parentSpanId: span.parentSpanId,
    name: span.name,
    startTimeUnixNano: span.startedAt * 1_000_000,
    endTimeUnixNano: (span.endedAt ?? span.startedAt) * 1_000_000,
    attributes,
    status: spanStatus(span),
  }
}

export const OTELSerializer = {
  serializeTrace(trace: Trace): OTELPayload {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'frankenbeast.trace.goal', value: { stringValue: trace.goal } },
              { key: 'frankenbeast.trace.id', value: { stringValue: trace.id } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: '@frankenbeast/observer' },
              spans: trace.spans.map(serializeSpan),
            },
          ],
        },
      ],
    }
  },
}
