import { describe, expect, it, vi } from 'vitest'
import type { Trace } from '../core/types.js'
import type { ExportAdapter } from '../export/ExportAdapter.js'
import {
  ClassificationGuardAdapter,
  RUNTIME_ARTIFACT_CLASSIFICATIONS,
  classifyRuntimeArtifact,
  enforceRuntimeArtifactExportPolicy,
} from './data-classification.js'

describe('runtime artifact data classification', () => {
  it('defines expected sensitivity labels for core runtime artifact types', () => {
    expect(Object.keys(RUNTIME_ARTIFACT_CLASSIFICATIONS).sort()).toEqual(
      [
        'audit-trail',
        'backup',
        'export',
        'log',
        'memory',
        'post-mortem',
        'prompt',
        'trace',
        'webhook',
      ].sort(),
    )
    expect(classifyRuntimeArtifact('log').classification).toBe('sensitive')
    expect(classifyRuntimeArtifact('memory').classification).toBe('user-private')
    expect(classifyRuntimeArtifact('backup').classification).toBe('secret')
    expect(classifyRuntimeArtifact('export').classification).toBe('sensitive')
    expect(classifyRuntimeArtifact('prompt').classification).toBe('user-private')
    expect(classifyRuntimeArtifact('webhook').classification).toBe('sensitive')
  })

  it('blocks secret artifacts from export unless redacted or explicitly overridden', () => {
    const backup = classifyRuntimeArtifact('backup')

    expect(() => enforceRuntimeArtifactExportPolicy(backup, { destination: 'external archive' })).toThrow(
      'Refusing to export secret backup artifact to external archive without redaction or explicit override',
    )

    expect(() => enforceRuntimeArtifactExportPolicy(backup, { redactionApplied: true })).not.toThrow()
    expect(() => enforceRuntimeArtifactExportPolicy(backup, { allowSensitiveExportOverride: true })).not.toThrow()
  })

  it('blocks user-private artifacts from export unless redacted or explicitly overridden', () => {
    const memory = classifyRuntimeArtifact('memory')

    expect(() => enforceRuntimeArtifactExportPolicy(memory)).toThrow(
      'Refusing to export user-private memory artifact without redaction or explicit override',
    )

    expect(() => enforceRuntimeArtifactExportPolicy(memory, { redactionApplied: true })).not.toThrow()
    expect(() => enforceRuntimeArtifactExportPolicy(memory, { allowSensitiveExportOverride: true })).not.toThrow()
  })

  it('keeps exported classification policy immutable at runtime', () => {
    const mutablePolicy = RUNTIME_ARTIFACT_CLASSIFICATIONS as unknown as Record<string, { classification: string }>
    expect(Object.isFrozen(RUNTIME_ARTIFACT_CLASSIFICATIONS)).toBe(true)
    expect(Object.isFrozen(RUNTIME_ARTIFACT_CLASSIFICATIONS.backup)).toBe(true)
    expect(Object.isFrozen(RUNTIME_ARTIFACT_CLASSIFICATIONS.backup.defaultControls)).toBe(true)

    expect(() => {
      mutablePolicy.backup.classification = 'sensitive'
    }).toThrow()

    expect(classifyRuntimeArtifact('backup').classification).toBe('secret')
  })

  it('returns defensive classification labels instead of live policy aliases', () => {
    const backup = classifyRuntimeArtifact('backup') as unknown as { classification: string }

    expect(() => {
      backup.classification = 'sensitive'
    }).toThrow()

    expect(classifyRuntimeArtifact('backup').classification).toBe('secret')
  })

  it('allows sensitive non-secret exports so redaction policy can be applied by destination wrappers', () => {
    expect(() => enforceRuntimeArtifactExportPolicy(classifyRuntimeArtifact('trace'))).not.toThrow()
    expect(() => enforceRuntimeArtifactExportPolicy(classifyRuntimeArtifact('webhook'))).not.toThrow()
  })

  it('prevents guarded secret trace exports before the wrapped adapter sees the trace', async () => {
    const inner = new RecordingAdapter()
    const guarded = new ClassificationGuardAdapter({
      adapter: inner,
      artifactType: 'trace',
      classification: 'secret',
      destination: 'third-party collector',
    })

    await expect(guarded.flush(exampleTrace)).rejects.toThrow(
      'Refusing to export secret trace artifact to third-party collector without redaction or explicit override',
    )
    expect(inner.flushed).toHaveLength(0)
  })

  it('enforces policy before active-span warnings can leak rejected artifact details', async () => {
    const inner = new RecordingAdapter()
    const guarded = new ClassificationGuardAdapter({
      adapter: inner,
      artifactType: 'prompt',
    })
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => true)

    await expect(guarded.flush(activeTrace)).rejects.toThrow(
      'Refusing to export user-private prompt artifact without redaction or explicit override',
    )
    expect(emitWarning).not.toHaveBeenCalled()
    emitWarning.mockRestore()
  })

  it('prevents callers from downgrading a secret default classification', async () => {
    const inner = new RecordingAdapter()
    const guarded = new ClassificationGuardAdapter({
      adapter: inner,
      artifactType: 'backup',
      classification: 'sensitive',
    })

    await expect(guarded.flush(exampleTrace)).rejects.toThrow(
      'Refusing to export secret backup artifact without redaction or explicit override',
    )
    expect(inner.flushed).toHaveLength(0)
  })

  it('passes guarded private exports after redaction is applied', async () => {
    const inner = new RecordingAdapter()
    const guarded = new ClassificationGuardAdapter({
      adapter: inner,
      artifactType: 'prompt',
      redactionApplied: true,
    })

    await guarded.flush(exampleTrace)

    expect(inner.flushed).toEqual([exampleTrace])
  })
})

const exampleTrace: Trace = {
  id: 'trace-1',
  goal: 'classify runtime artifacts',
  status: 'completed',
  startedAt: 1,
  endedAt: 2,
  spans: [],
}

const activeTrace: Trace = {
  ...exampleTrace,
  spans: [
    {
      id: 'span-1',
      traceId: 'trace-1',
      name: 'collect private prompt',
      status: 'active',
      startedAt: 1,
      metadata: {},
      thoughtBlocks: [],
    },
  ],
}

class RecordingAdapter implements ExportAdapter {
  readonly flushed: Trace[] = []

  async flush(trace: Trace): Promise<void> {
    this.flushed.push(trace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.flushed.find(trace => trace.id === traceId) ?? null
  }

  async listTraceIds(): Promise<string[]> {
    return this.flushed.map(trace => trace.id)
  }
}
