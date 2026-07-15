import { describe, expect, it, vi } from 'vitest'
import type { Span, Trace } from '../core/types.js'
import { BatchAdapter } from '../adapters/batch/BatchAdapter.js'
import { MultiAdapter } from '../adapters/multi/MultiAdapter.js'
import { InMemoryAdapter } from '../export/InMemoryAdapter.js'
import type { ExportAdapter } from '../export/ExportAdapter.js'
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

class ThrowingDeleteAdapter extends NonDeletingAdapter {
  deleteTrace(): void {
    throw new Error('delete failed')
  }
}

class FailingOnceDeleteAdapter implements ExportAdapter {
  private readonly traces = new Map<string, Trace>()
  deleteAttempts = 0

  async flush(trace: Trace): Promise<void> {
    this.traces.set(trace.id, trace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.traces.get(traceId) ?? null
  }

  async listTraceIds(): Promise<string[]> {
    return [...this.traces.keys()]
  }

  async deleteTrace(traceId: string): Promise<void> {
    this.deleteAttempts += 1
    if (this.deleteAttempts === 1) throw new Error('transient delete failure')
    this.traces.delete(traceId)
  }
}

class SlowFlushingAdapter implements ExportAdapter {
  private readonly inner = new InMemoryAdapter()
  private releaseFlush: (() => void) | null = null
  readonly flushStarted = new Promise<void>(resolve => {
    this.releaseFlush = resolve
  })

  async flush(trace: Trace): Promise<void> {
    await this.flushStarted
    await this.inner.flush(trace)
  }

  release(): void {
    this.releaseFlush?.()
  }

  queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.inner.queryByTraceId(traceId)
  }

  listTraceIds(): Promise<string[]> {
    return this.inner.listTraceIds()
  }

  deleteTrace(traceId: string): Promise<void> {
    return this.inner.deleteTrace(traceId)
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

  it('does not report raw transcript storage when retention is disabled', () => {
    const report = describeTranscriptRetentionPolicy({ mode: 'disabled', redactionLevel: 'none' })

    expect(report.storesRawTranscriptContent).toBe(false)
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
      cleanupRemovesStoredTraces: true,
    })
  })

  it('surfaces raw retention cleanup gaps for non-deleting adapters', () => {
    const adapter = new TranscriptRetentionAdapter({
      adapter: new NonDeletingAdapter(),
      mode: 'raw',
      redactionLevel: 'none',
    })

    expect(adapter.describePolicy()).toMatchObject({
      storesRawTranscriptContent: true,
      cleanupRemovesStoredTraces: false,
      cleanupWarning: expect.stringContaining('does not support deleteTrace'),
    })
  })

  it('reports access policy and retained transcript fields for operator visibility', () => {
    const report = describeTranscriptRetentionPolicy({
      ttlMs: 60_000,
      accessLevel: 'restricted',
      retainedFields: { toolOutputs: false },
      now: () => 1_000,
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
      cleanupRemovesStoredTraces: true,
      expiresAt: 61_000,
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

  it('does not retain expired IDs after successful backend deletes', async () => {
    let now = 10
    const inner = new InMemoryAdapter()
    const adapter = new TranscriptRetentionAdapter({ adapter: inner, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect((adapter as unknown as { expiredTraceIds: Set<string> }).expiredTraceIds.has('trace-1')).toBe(false)
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
          input_json: 'raw serialized input',
          argsJson: 'raw args json',
          toolResultPayload: 'raw tool output',
          safeCounter: 1,
        },
      })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      promptText: '[REDACTED_TRANSCRIPT]',
      systemPromptAddition: '[REDACTED_TRANSCRIPT]',
      tool_input_json: '[REDACTED_TRANSCRIPT]',
      input_json: '[REDACTED_TRANSCRIPT]',
      argsJson: '[REDACTED_TRANSCRIPT]',
      toolResultPayload: '[REDACTED_TRANSCRIPT]',
      safeCounter: 1,
    })
  })

  it('redacts instruction and transcript variant metadata keys', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          systemInstruction: 'private system instruction',
          custom_instructions: 'private custom instructions',
          transcriptText: 'private transcript text',
          safeCounter: 1,
        },
      })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      systemInstruction: '[REDACTED_TRANSCRIPT]',
      custom_instructions: '[REDACTED_TRANSCRIPT]',
      transcriptText: '[REDACTED_TRANSCRIPT]',
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

  it('redacts transcript fields exposed only through custom JSON serialization', () => {
    class ProviderPayload {
      toJSON(): Record<string, unknown> {
        return { prompt: 'private serialized prompt', safeCounter: 1 }
      }
    }

    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: { payload: new ProviderPayload() },
      })],
    }))

    expect(retained.spans[0].metadata['payload']).toEqual({
      prompt: '[REDACTED_TRANSCRIPT]',
      safeCounter: 1,
    })
  })

  it('preserves binary views instead of applying custom JSON serialization', () => {
    const bytes = Buffer.from([1, 2, 3])
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({ metadata: { bytes } })],
    }))

    expect(retained.spans[0].metadata['bytes']).toBe(bytes)
  })

  it('reuses retained custom JSON clones for repeated metadata references', () => {
    class SharedPayload {
      toJSON(): Record<string, unknown> {
        return { safeCounter: 1 }
      }
    }
    const payload = new SharedPayload()

    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({ metadata: { first: payload, second: payload } })],
    }))

    expect(retained.spans[0].metadata).toEqual({
      first: { safeCounter: 1 },
      second: { safeCounter: 1 },
    })
    expect(retained.spans[0].metadata['second']).toBe(retained.spans[0].metadata['first'])
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

  it('keeps expired traces hidden even when backend deletion throws', async () => {
    let now = 10
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const adapter = new TranscriptRetentionAdapter({ adapter: new ThrowingDeleteAdapter(), ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect(await adapter.listTraceIds()).toEqual([])
    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      '[TranscriptRetentionAdapter] Failed to delete expired trace trace-1:',
      expect.any(Error),
    )
    warn.mockRestore()
  })

  it('retries transient backend delete failures on later cleanup passes', async () => {
    let now = 10
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const inner = new FailingOnceDeleteAdapter()
    const adapter = new TranscriptRetentionAdapter({ adapter: inner, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
    expect(await inner.listTraceIds()).toEqual(['trace-1'])
    expect(await adapter.cleanupExpired()).toEqual(['trace-1'])
    expect(await inner.listTraceIds()).toEqual([])
    expect(inner.deleteAttempts).toBe(2)
    warn.mockRestore()
  })

  it('continues deleting from later child adapters when one child delete throws', async () => {
    let now = 10
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const throwing = new ThrowingDeleteAdapter()
    const deletable = new InMemoryAdapter()
    const multi = new MultiAdapter({ adapters: [throwing, deletable] })
    const adapter = new TranscriptRetentionAdapter({ adapter: multi, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    now = 16

    await expect(adapter.cleanupExpired()).resolves.toEqual(['trace-1'])
    expect(await throwing.listTraceIds()).toEqual(['trace-1'])
    expect(await deletable.listTraceIds()).toEqual([])
    expect(await adapter.listTraceIds()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('deletes from the inner adapter after an in-flight batch drain persists an expired trace', async () => {
    let now = 10
    const slow = new SlowFlushingAdapter()
    const batch = new BatchAdapter({ adapter: slow, maxBatchSize: 10 })
    const adapter = new TranscriptRetentionAdapter({ adapter: batch, ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 8, endedAt: 10 }))
    const drain = batch.drain()
    now = 16
    const cleanup = adapter.cleanupExpired()

    slow.release()
    await drain
    await expect(cleanup).resolves.toEqual(['trace-1'])
    expect(await slow.listTraceIds()).toEqual([])
    expect(await adapter.listTraceIds()).toEqual([])
  })

  it('retains active traces from flush time instead of expiring them by start time', async () => {
    let now = 100
    const adapter = new TranscriptRetentionAdapter({ adapter: new InMemoryAdapter(), ttlMs: 5, now: () => now })

    await adapter.flush(makeTrace({ startedAt: 1, endedAt: undefined }))
    expect(await adapter.listTraceIds()).toEqual(['trace-1'])

    now = 106
    expect(await adapter.listTraceIds()).toEqual([])
  })

  it('expires restarted active traces from their original start time when no retained timestamp is available', async () => {
    const inner = new InMemoryAdapter()
    await inner.flush(makeTrace({ startedAt: 1, endedAt: undefined }))

    const adapter = new TranscriptRetentionAdapter({ adapter: inner, ttlMs: 5, now: () => 100 })

    expect(await adapter.queryByTraceId('trace-1')).toBeNull()
    expect(await adapter.listTraceIds()).toEqual([])
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
          promptTokenCount: 13,
          prompt_tokens_details: { cached_tokens: 4 },
          completionTokens: 3,
          messages: [{ role: 'user', content: 'private chat prompt' }],
          transcript: ['private transcript line'],
          stdin: 'private standard input',
        },
      })],
    }))

    expect(retained.spans[0].metadata['promptTokens']).toBe(12)
    expect(retained.spans[0].metadata['promptTokenCount']).toBe(13)
    expect(retained.spans[0].metadata['prompt_tokens_details']).toEqual({ cached_tokens: 4 })
    expect(retained.spans[0].metadata['completionTokens']).toBe(3)
    expect(retained.spans[0].metadata['messages']).toBe('[REDACTED_TRANSCRIPT]')
    expect(retained.spans[0].metadata['transcript']).toBe('[REDACTED_TRANSCRIPT]')
    expect(retained.spans[0].metadata['stdin']).toBe('[REDACTED_TRANSCRIPT]')
  })

  it('honors tool output opt-outs inside raw provider message arrays', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          messages: [
            { role: 'user', content: 'private prompt' },
            { role: 'tool', content: 'private role-only tool result', tool_call_id: 'call-0' },
            { role: 'tool', type: 'tool_result', content: 'private tool result', tool_call_id: 'call-1' },
          ],
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.spans[0].metadata['messages']).toEqual([
      { role: 'user', content: 'private prompt' },
      { role: 'tool', tool_call_id: 'call-0' },
      { role: 'tool', type: 'tool_result', tool_call_id: 'call-1' },
    ])
  })

  it('drops raw provider text blocks when prompt retention is disabled', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          messages: [
            'private primitive prompt',
            { type: 'text', text: 'private prompt text' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,private' } },
            { type: 'input_audio', input_audio: { data: 'private-base64-audio' } },
            { role: 'tool', content: 'private tool result', tool_call_id: 'call-1' },
          ],
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { prompts: false, toolOutputs: true },
    })

    expect(retained.spans[0].metadata['messages']).toEqual([
      '[TRANSCRIPT_NOT_RETAINED]',
      { type: 'text' },
      { type: 'image_url' },
      { type: 'input_audio' },
      { role: 'tool', content: 'private tool result', tool_call_id: 'call-1' },
    ])
  })

  it('redacts provider stream deltas stored under opaque metadata keys', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          streamEvent: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'private streamed prompt' },
          },
          untypedStreamEvent: {
            type: 'content_block_delta',
            delta: { text: 'private untyped streamed prompt' },
          },
          toolEvent: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{"secret":"tool args"}' },
          },
          thinkingEvent: {
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: 'private chain of thought' },
          },
        },
      })],
    }))

    expect(retained.spans[0].metadata['streamEvent']).toEqual({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: '[REDACTED_TRANSCRIPT]' },
    })
    expect(retained.spans[0].metadata['untypedStreamEvent']).toEqual({
      type: 'content_block_delta',
      delta: { text: '[REDACTED_TRANSCRIPT]' },
    })
    expect(retained.spans[0].metadata['toolEvent']).toEqual({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '[REDACTED_TRANSCRIPT]' },
    })
    expect(retained.spans[0].metadata['thinkingEvent']).toEqual({
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: '[REDACTED_TRANSCRIPT]' },
    })
  })

  it('honors tool input opt-outs for raw provider stream deltas', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          toolEvent: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{"secret":"tool args"}' },
          },
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolInputs: false },
    })

    expect(retained.spans[0].metadata['toolEvent']).toEqual({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta' },
    })
  })

  it('redacts multimodal prompt block payloads stored under opaque metadata keys', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          payload: {
            type: 'input_audio',
            input_audio: { data: 'private-base64-audio' },
          },
          document: {
            type: 'file',
            file_data: 'private-file-bytes',
          },
        },
      })],
    }))

    expect(retained.spans[0].metadata['payload']).toEqual({
      type: 'input_audio',
      input_audio: '[REDACTED_TRANSCRIPT]',
    })
    expect(retained.spans[0].metadata['document']).toEqual({
      type: 'file',
      file_data: '[REDACTED_TRANSCRIPT]',
    })
  })

  it('redacts output text blocks and injected operator context fields', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          block: { type: 'output_text', text: 'private assistant transcript' },
          hookSpecificOutput: { additionalContext: 'private operator context' },
        },
      })],
    }))

    expect(retained.spans[0].metadata['block']).toEqual({
      type: 'output_text',
      text: '[REDACTED_TRANSCRIPT]',
    })
    expect(retained.spans[0].metadata['hookSpecificOutput']).toEqual({
      additionalContext: '[REDACTED_TRANSCRIPT]',
    })
  })

  it('honors tool output opt-outs inside raw prompt envelopes', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          llmPayload: {
            messages: [
              { role: 'user', content: 'private prompt' },
              { role: 'tool', type: 'tool_result', content: 'private tool result', tool_call_id: 'call-1' },
            ],
          },
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.spans[0].metadata['llmPayload']).toEqual({
      messages: [
        { role: 'user', content: 'private prompt' },
        { role: 'tool', type: 'tool_result', tool_call_id: 'call-1' },
      ],
    })
  })

  it('honors prompt opt-outs for standalone raw provider text blocks', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          message: { type: 'text', text: 'private standalone prompt', safeCounter: 1 },
          system: 'private system prompt',
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { prompts: false },
    })

    expect(retained.spans[0].metadata['message']).toEqual({ type: 'text', safeCounter: 1 })
    expect(retained.spans[0].metadata).not.toHaveProperty('system')
  })

  it('honors tool output opt-outs for standalone raw tool result text blocks', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          payload: { type: 'tool_result', text: 'private standalone tool result', tool_call_id: 'call-1' },
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.spans[0].metadata['payload']).toEqual({
      type: 'tool_result',
      tool_call_id: 'call-1',
    })
  })

  it('honors tool output opt-outs for standalone raw tool result objects', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          payload: { type: 'tool_result', content: 'private tool result', tool_call_id: 'call-1' },
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.spans[0].metadata['payload']).toEqual({
      type: 'tool_result',
      tool_call_id: 'call-1',
    })
  })

  it('honors tool output opt-outs for root metadata tool result envelopes', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: { role: 'tool', content: 'private root tool result', tool_call_id: 'call-1' },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.spans[0].metadata).toEqual({ role: 'tool', tool_call_id: 'call-1' })
  })

  it('honors tool output opt-outs for enumerable raw provider payload objects', () => {
    class ToolPayload {
      role = 'tool'
      content = 'private enumerable tool result'
      tool_call_id = 'call-1'
    }

    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({ metadata: { payload: new ToolPayload() } })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { toolOutputs: false },
    })

    expect(retained.spans[0].metadata['payload']).toEqual({ role: 'tool', tool_call_id: 'call-1' })
  })

  it('retains allowed tool outputs inside raw message containers when prompts are disabled', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          messages: [
            { role: 'user', content: 'private prompt' },
            { role: 'tool', content: 'private tool result', tool_call_id: 'call-1' },
          ],
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { prompts: false, toolOutputs: true },
    })

    expect(retained.spans[0].metadata['messages']).toEqual([
      { role: 'user' },
      { role: 'tool', content: 'private tool result', tool_call_id: 'call-1' },
    ])
  })

  it('drops object-valued prompt fields when raw prompt retention is disabled', () => {
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({
        metadata: {
          prompt: { text: 'private prompt text', safeCounter: 1 },
          messages: [{ role: 'tool', content: 'private tool result', tool_call_id: 'call-1' }],
        },
      })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { prompts: false, toolOutputs: true },
    })

    expect(retained.spans[0].metadata).not.toHaveProperty('prompt')
    expect(retained.spans[0].metadata['messages']).toEqual([
      { role: 'tool', content: 'private tool result', tool_call_id: 'call-1' },
    ])
  })

  it('filters raw object-valued transcript fields before cloning shared metadata', () => {
    const metadata: Record<string, unknown> = { prompt: 'private prompt' }
    metadata['toolInput'] = metadata
    const retained = applyRetentionPolicy(makeTrace({
      spans: [makeSpan({ metadata })],
    }), {
      mode: 'raw',
      redactionLevel: 'none',
      retainedFields: { prompts: false, toolInputs: true },
    })

    expect(retained.spans[0].metadata).toHaveProperty('toolInput')
    expect(retained.spans[0].metadata).not.toHaveProperty('prompt')
    expect(retained.spans[0].metadata['toolInput']).toBe(retained.spans[0].metadata)
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
          keyedPayload: new Map<object, string>([[{ prompt: 'private key prompt' }, 'safe value']]),
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
    const keyedPayload = retained.spans[0].metadata['keyedPayload'] as Map<Record<string, unknown>, string>
    expect(keyedPayload).toBeInstanceOf(Map)
    expect([...keyedPayload.keys()]).toEqual([{ prompt: '[REDACTED_TRANSCRIPT]' }])
    expect([...keyedPayload.values()]).toEqual(['safe value'])
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
