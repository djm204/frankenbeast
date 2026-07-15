import { describe, expect, it } from 'vitest'
import type { Span, Trace } from '../core/types.js'
import { BatchAdapter } from '../adapters/batch/BatchAdapter.js'
import { MultiAdapter } from '../adapters/multi/MultiAdapter.js'
import { InMemoryAdapter } from '../export/InMemoryAdapter.js'
import type { ExportAdapter, TraceSummary } from '../export/ExportAdapter.js'
import {
  TranscriptRetentionAdapter,
  applyRetentionPolicy,
  describeTranscriptRetentionPolicy,
} from './transcript-retention.js'

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: 'span-1',
    traceId: 'trace-1',
    name: 'tool-call',
    status: 'completed',
    startedAt: 1,
    endedAt: 2,
    durationMs: 1,
    errorMessage: 'raw failure with private context',
    metadata: {
      prompt: 'raw prompt text',
      toolInput: { query: 'private input', nested: { args: 'secret args' } },
      toolOutput: 'private output',
      summary: 'private summary',
      safeCounter: 1,
    },
    thoughtBlocks: ['private reasoning'],
    ...overrides,
  }
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    id: 'trace-1',
    goal: 'user prompt with secret context',
    status: 'completed',
    startedAt: 1,
    endedAt: 2,
    spans: [makeSpan()],
    ...overrides,
  }
}

class NonDeletingAdapter implements ExportAdapter {
  private readonly traces = new Map<string, Trace>()

  async flush(trace: Trace): Promise<void> {
    this.traces.set(trace.id, trace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.traces.get(traceId) ?? null
  }

  async listTraceIds(): Promise<string[]> {
    return [...this.traces.keys()]
  }

  async listTraceSummaries(): Promise<TraceSummary[]> {
    return [...this.traces.values()].map(trace => ({
      id: trace.id,
      goal: trace.goal,
      status: trace.status,
      spanCount: trace.spans.length,
      startedAt: trace.startedAt,
    }))
  }
}

describe('transcript retention controls', () => {
  it('defaults to redacted retention for prompts, tool I/O, errors, and summaries', async () => {
    const inner = new InMemoryAdapter()
    const adapter = new TranscriptRetentionAdapter({ adapter: inner, now: () => 3 })

    await adapter.flush(makeTrace())

    const stored = await inner.queryByTraceId('trace-1')
    expect(stored?.goal).toBe('[REDACTED_TRANSCRIPT]')
    expect(stored?.spans[0].metadata['prompt']).toBe('[REDACTED_TRANSCRIPT]')
    expect(stored?.spans[0].metadata['toolInput']).toBe('[REDACTED_TRANSCRIPT]')
    expect(stored?.spans[0].metadata['toolOutput']).toBe('[REDACTED_TRANSCRIPT]')
    expect(stored?.spans[0].metadata['summary']).toBe('[REDACTED_TRANSCRIPT]')
    expect(stored?.spans[0].errorMessage).toBe('[REDACTED_TRANSCRIPT]')
    expect(stored?.spans[0].thoughtBlocks).toEqual(['[REDACTED_TRANSCRIPT]'])
    expect(stored?.spans[0].metadata['safeCounter']).toBe(1)
  })

  it('supports disabled retention by avoiding writes entirely', async () => {
    const inner = new InMemoryAdapter()
    const adapter = new TranscriptRetentionAdapter({ adapter: inner, mode: 'disabled' })

    await adapter.flush(makeTrace())

    expect(await inner.listTraceIds()).toEqual([])
    expect(await adapter.listTraceIds()).toEqual([])
  })

  it('hides pre-existing backend traces and summaries when retention is disabled', async () => {
    const inner = new InMemoryAdapter()
    await inner.flush(makeTrace())

    const adapter = new TranscriptRetentionAdapter({ adapter: inner, mode: 'disabled' })

    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
    expect(await adapter.listTraceIds()).toEqual([])
    expect(await adapter.listTraceSummaries()).toEqual([])
    expect(await inner.listTraceIds()).toEqual(['trace-1'])
  })

  it('can drop selected transcript fields while retaining non-transcript metadata', () => {
    const retained = applyRetentionPolicy(makeTrace(), {
      retainedFields: {
        prompts: false,
        toolInputs: false,
        toolOutputs: false,
        errors: false,
        summaries: false,
      },
    })

    expect(retained.goal).toBe('[TRANSCRIPT_NOT_RETAINED]')
    expect(retained.spans[0].metadata).toEqual({ safeCounter: 1 })
    expect(retained.spans[0].errorMessage).toBeUndefined()
    expect(retained.spans[0].thoughtBlocks).toEqual([])
  })

  it('honors explicit raw operator retention without redacting transcript fields', async () => {
    const inner = new InMemoryAdapter()
    const adapter = new TranscriptRetentionAdapter({
      adapter: inner,
      mode: 'raw',
      redactionLevel: 'none',
      accessLevel: 'operator',
      now: () => 3,
    })

    await adapter.flush(makeTrace())

    const stored = await adapter.queryByTraceId('trace-1')
    expect(stored?.goal).toBe('user prompt with secret context')
    expect(stored?.spans[0].metadata['toolOutput']).toBe('private output')
    expect(adapter.describePolicy()).toMatchObject({
      mode: 'raw',
      redactionLevel: 'none',
      accessLevel: 'operator',
      storesRawTranscriptContent: true,
    })
  })

  it('reports access policy and retained transcript fields for operator visibility', () => {
    const report = describeTranscriptRetentionPolicy({
      ttlMs: 60_000,
      accessLevel: 'restricted',
      retainedFields: { toolOutputs: false },
    })

    expect(report).toMatchObject({
      mode: 'redacted',
      ttlMs: 60_000,
      redactionLevel: 'mask',
      accessLevel: 'restricted',
      retainedFields: {
        prompts: true,
        toolInputs: true,
        toolOutputs: false,
        errors: true,
        summaries: true,
      },
      storesRawTranscriptContent: false,
    })
  })

  it('cleans up expired retained traces and hides them from reads', async () => {
    let now = 10
    const inner = new InMemoryAdapter()
    const adapter = new TranscriptRetentionAdapter({ adapter: inner, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    expect(await adapter.listTraceIds()).toEqual(['trace-1'])

    now = 16
    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
    expect(await inner.listTraceIds()).toEqual([])
  })

  it('keeps expired traces hidden when the wrapped backend cannot delete them', async () => {
    let now = 10
    const adapter = new TranscriptRetentionAdapter({ adapter: new NonDeletingAdapter(), ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect(await adapter.listTraceIds()).toEqual([])
    expect(await adapter.listTraceSummaries()).toEqual([])
    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
  })

  it('filters expired persisted summaries after wrapping an existing backend', async () => {
    let now = 10
    const backend = new InMemoryAdapter()
    await backend.flush(makeTrace({ startedAt: 8, endedAt: 10 }))

    now = 16
    const adapter = new TranscriptRetentionAdapter({ adapter: backend, ttlMs: 5, now: () => now })

    expect(await adapter.listTraceSummaries()).toEqual([])
    expect(await adapter.listTraceIds()).toEqual([])
  })

  it('honors per-field opt-outs even when raw transcript retention is enabled', () => {
    const retained = applyRetentionPolicy(makeTrace(), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.goal).toBe('user prompt with secret context')
    expect(retained.spans[0].metadata['toolInput']).toEqual({ query: 'private input', nested: { args: 'secret args' } })
    expect(retained.spans[0].metadata).not.toHaveProperty('toolOutput')
  })

  it('reports raw storage whenever redaction is disabled', () => {
    expect(describeTranscriptRetentionPolicy({ redactionLevel: 'none' })).toMatchObject({
      mode: 'redacted',
      redactionLevel: 'none',
      storesRawTranscriptContent: true,
    })
  })

  it('redacts common snake_case transcript metadata keys', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          system_prompt: 'raw system prompt',
          tool_input: 'raw input',
          tool_output: 'raw output',
          error_message: 'raw error',
        },
      })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      system_prompt: '[REDACTED_TRANSCRIPT]',
      tool_input: '[REDACTED_TRANSCRIPT]',
      tool_output: '[REDACTED_TRANSCRIPT]',
      error_message: '[REDACTED_TRANSCRIPT]',
    })
  })

  it('redacts common suffixed transcript metadata keys', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          promptText: 'raw prompt text',
          systemPromptAddition: 'raw system prompt',
          tool_input_json: 'raw tool input',
          toolResultPayload: 'raw tool output',
          safeCounter: 1,
        },
      })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      promptText: '[REDACTED_TRANSCRIPT]',
      systemPromptAddition: '[REDACTED_TRANSCRIPT]',
      tool_input_json: '[REDACTED_TRANSCRIPT]',
      toolResultPayload: '[REDACTED_TRANSCRIPT]',
      safeCounter: 1,
    })
  })

  it('redacts Error objects stored under opaque metadata keys', () => {
    const cause = new Error('nested private cause')
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          payload: new Error('private prompt stack', { cause }),
          safeCounter: 1,
        },
      })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      payload: '[REDACTED_TRANSCRIPT]',
      safeCounter: 1,
    })
  })

  it('redacts delegated summary goals nested under opaque metadata keys', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          delegation: {
            delegatedTask: {
              goal: 'private delegated task goal',
              status: 'completed',
            },
            delegatedSummary: {
              goal: 'private delegated task goal',
              summary: 'private delegated summary',
            },
            childGoals: ['private child goal'],
          },
          safeCounter: 1,
        },
      })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      delegation: {
        delegatedTask: {
          goal: '[REDACTED_TRANSCRIPT]',
          status: 'completed',
        },
        delegatedSummary: '[REDACTED_TRANSCRIPT]',
        childGoals: '[REDACTED_TRANSCRIPT]',
      },
      safeCounter: 1,
    })
  })

  it('redacts transcript fields inside enumerable non-plain metadata objects', () => {
    class ToolPayload {
      promptText = 'private class prompt'
      stdout = 'private class output'
      safeCounter = 1
    }

    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({ metadata: { payload: new ToolPayload() } })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      payload: {
        promptText: '[REDACTED_TRANSCRIPT]',
        stdout: '[REDACTED_TRANSCRIPT]',
        safeCounter: 1,
      },
    })
  })

  it('removes expired traces from batch and multi adapter wrappers', async () => {
    let now = 10
    const primary = new InMemoryAdapter()
    const secondary = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: primary, maxBatchSize: 10 })
    const multi = new MultiAdapter({ adapters: [batch, secondary] })
    const adapter = new TranscriptRetentionAdapter({ adapter: multi, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    await batch.drain()

    expect(await primary.listTraceIds()).toEqual([])
    expect(await secondary.listTraceIds()).toEqual([])
    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
  })

  it('keeps partially deleted expired traces hidden across multi-adapter children', async () => {
    let now = 10
    const deletable = new InMemoryAdapter()
    const nonDeleting = new NonDeletingAdapter()
    const multi = new MultiAdapter({ adapters: [deletable, nonDeleting] })
    const adapter = new TranscriptRetentionAdapter({ adapter: multi, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect(await deletable.listTraceIds()).toEqual([])
    expect(await nonDeleting.listTraceIds()).toEqual(['trace-1'])
    expect(await adapter.listTraceIds()).toEqual([])
    expect(await adapter.listTraceSummaries()).toEqual([])
    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
  })

  it('keeps internal-slot objects intact instead of cloning them with fake prototypes', () => {
    const url = new URL('https://example.test/path')
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({ metadata: { url } })],
    }))

    expect(retained.spans[0].metadata['url']).toBe(url)
    expect(String(retained.spans[0].metadata['url'])).toBe('https://example.test/path')
  })

  it('handles cyclic metadata while redacting nested transcript fields', () => {
    const metadata: Record<string, unknown> = { nested: { tool_output: 'raw output' } }
    metadata['self'] = metadata

    const retained = applyRetentionPolicy(makeTrace({ spans: [makeSpan({ metadata })] }))
    const retainedMetadata = retained.spans[0].metadata

    expect((retainedMetadata['nested'] as Record<string, unknown>)['tool_output']).toBe('[REDACTED_TRANSCRIPT]')
    expect(retainedMetadata['self']).toBe(retainedMetadata)
  })

  it('preserves non-transcript metadata object types', () => {
    const map = new Map([['key', 'value']])
    const set = new Set(['value'])
    const pattern = /abc/u
    const bytes = new Uint8Array([1, 2, 3])

    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: { map, set, pattern, bytes },
      })],
    }))

    expect(retained.spans[0].metadata['map']).toEqual(map)
    expect(retained.spans[0].metadata['set']).toEqual(set)
    expect(retained.spans[0].metadata['pattern']).toBe(pattern)
    expect(retained.spans[0].metadata['bytes']).toEqual(bytes)
  })

  it('reapplies the active policy to backend traces and summaries', async () => {
    const inner = new InMemoryAdapter()
    await inner.flush(makeTrace())
    const adapter = new TranscriptRetentionAdapter({ adapter: inner, now: () => 3 })

    const trace = await adapter.queryByTraceId('trace-1')
    const summaries = await adapter.listTraceSummaries()

    expect(trace?.goal).toBe('[REDACTED_TRANSCRIPT]')
    expect(trace?.spans[0].metadata['prompt']).toBe('[REDACTED_TRANSCRIPT]')
    expect(summaries).toEqual([
      {
        id: 'trace-1',
        goal: '[REDACTED_TRANSCRIPT]',
        status: 'completed',
        spanCount: 1,
        startedAt: 1,
      },
    ])
  })

  it('keeps token counters numeric while redacting chat transcript shapes', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          promptTokens: 12,
          completionTokens: 3,
          messages: [{ role: 'user', content: 'private chat prompt' }],
          transcript: ['private transcript line'],
          stdin: 'private standard input',
        },
      })],
    }))

    expect(retained.spans[0].metadata['promptTokens']).toBe(12)
    expect(retained.spans[0].metadata['completionTokens']).toBe(3)
    expect(retained.spans[0].metadata['messages']).toBe('[REDACTED_TRANSCRIPT]')
    expect(retained.spans[0].metadata['transcript']).toBe('[REDACTED_TRANSCRIPT]')
    expect(retained.spans[0].metadata['stdin']).toBe('[REDACTED_TRANSCRIPT]')
  })

  it('walks Map and Set metadata before preserving their container types', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          payload: new Map<string, unknown>([
            ['prompt', 'private map prompt'],
            ['safeCounter', 1],
            ['nested', { tool_output: 'private nested output' }],
          ]),
          records: new Set<unknown>([{ transcript: 'private set transcript' }, { safeCounter: 2 }]),
        },
      })],
    }))

    const payload = retained.spans[0].metadata['payload'] as Map<string, unknown>
    const records = retained.spans[0].metadata['records'] as Set<Record<string, unknown>>

    expect(payload).toBeInstanceOf(Map)
    expect(payload.get('prompt')).toBe('[REDACTED_TRANSCRIPT]')
    expect(payload.get('safeCounter')).toBe(1)
    expect(payload.get('nested')).toEqual({ tool_output: '[REDACTED_TRANSCRIPT]' })
    expect(records).toBeInstanceOf(Set)
    expect([...records]).toEqual([{ transcript: '[REDACTED_TRANSCRIPT]' }, { safeCounter: 2 }])
  })

  it('preserves own __proto__ metadata keys as data properties', () => {
    const metadata: Record<string, unknown> = { safeCounter: 1 }
    Object.defineProperty(metadata, '__proto__', {
      value: { tool_output: 'private output' },
      enumerable: true,
      configurable: true,
      writable: true,
    })

    const retained = applyRetentionPolicy(makeTrace({ spans: [makeSpan({ metadata })] }))
    const retainedMetadata = retained.spans[0].metadata

    expect(Object.prototype.hasOwnProperty.call(retainedMetadata, '__proto__')).toBe(true)
    expect(retainedMetadata['__proto__']).toEqual({ tool_output: '[REDACTED_TRANSCRIPT]' })
    expect(Object.getPrototypeOf(retainedMetadata)).toBe(Object.prototype)
  })
})
