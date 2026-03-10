import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { TraceContext } from '../core/TraceContext.js'
import { SpanLifecycle } from '../core/SpanLifecycle.js'
import { PostMortemGenerator } from './PostMortemGenerator.js'
import type { InterruptSignal } from './InterruptEmitter.js'

function makeSignal(traceId: string, overrides?: Partial<InterruptSignal>): InterruptSignal {
  return {
    traceId,
    detectedPattern: ['plan', 'search', 'execute'],
    repetitions: 3,
    timestamp: 1_700_000_000_000,
    ...overrides,
  }
}

function makeTrace() {
  const trace = TraceContext.createTrace('Analyse customer churn')
  const spans = ['plan', 'search', 'execute', 'plan', 'search', 'execute', 'plan', 'search', 'execute']
  for (const name of spans) {
    const span = TraceContext.startSpan(trace, { name })
    SpanLifecycle.setMetadata(span, { step: name })
    TraceContext.endSpan(span)
  }
  TraceContext.endTrace(trace)
  return trace
}

describe('PostMortemGenerator', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = join(tmpdir(), `pm-test-${randomUUID()}`)
  })

  afterEach(() => {
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true })
  })

  describe('generateContent()', () => {
    it('returns a non-empty markdown string', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const content = gen.generateContent(trace, makeSignal(trace.id))
      expect(typeof content).toBe('string')
      expect(content.length).toBeGreaterThan(0)
    })

    it('includes the trace id', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const content = gen.generateContent(trace, makeSignal(trace.id))
      expect(content).toContain(trace.id)
    })

    it('includes the trace goal', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const content = gen.generateContent(trace, makeSignal(trace.id))
      expect(content).toContain('Analyse customer churn')
    })

    it('includes the detected pattern', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const signal = makeSignal(trace.id, { detectedPattern: ['plan', 'search', 'execute'] })
      const content = gen.generateContent(trace, signal)
      expect(content).toContain('plan')
      expect(content).toContain('search')
      expect(content).toContain('execute')
    })

    it('includes the repetition count', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const content = gen.generateContent(trace, makeSignal(trace.id, { repetitions: 3 }))
      expect(content).toContain('3')
    })

    it('includes a trace replay listing all span names', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const content = gen.generateContent(trace, makeSignal(trace.id))
      // All 9 span names should appear
      for (const name of ['plan', 'search', 'execute']) {
        expect(content).toContain(name)
      }
    })

    it('includes an ISO timestamp derived from signal.timestamp', () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const signal = makeSignal(trace.id, { timestamp: 1_700_000_000_000 })
      const content = gen.generateContent(trace, signal)
      expect(content).toContain('2023-11-14') // ISO date for that Unix ms
    })
  })

  describe('generate()', () => {
    it('writes a markdown file and returns its path', async () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const filePath = await gen.generate(trace, makeSignal(trace.id))
      expect(existsSync(filePath)).toBe(true)
      expect(filePath.endsWith('.md')).toBe(true)
    })

    it('filename contains the trace id', async () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const filePath = await gen.generate(trace, makeSignal(trace.id))
      expect(filePath).toContain(trace.id)
    })

    it('written file content matches generateContent()', async () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const signal = makeSignal(trace.id)
      const filePath = await gen.generate(trace, signal)
      const written = readFileSync(filePath, 'utf-8')
      const expected = gen.generateContent(trace, signal)
      expect(written).toBe(expected)
    })

    it('creates the outputDir if it does not exist', async () => {
      const nested = join(outputDir, 'deep', 'nested')
      const gen = new PostMortemGenerator({ outputDir: nested })
      const trace = makeTrace()
      const filePath = await gen.generate(trace, makeSignal(trace.id))
      expect(existsSync(filePath)).toBe(true)
    })
  })

  describe('E2E: repeating trace → post-mortem file', () => {
    it('LoopDetector→InterruptEmitter→PostMortemGenerator produces a report with correct trace id and pattern', async () => {
      const { LoopDetector } = await import('./LoopDetector.js')
      const { InterruptEmitter } = await import('./InterruptEmitter.js')

      const trace = makeTrace()
      const gen = new PostMortemGenerator({ outputDir })
      const detector = new LoopDetector({ windowSize: 3, repeatThreshold: 3 })
      const emitter = new InterruptEmitter()

      let postMortemPath: string | null = null

      detector.on('loop-detected', result => {
        emitter.emit({ traceId: trace.id, ...result, timestamp: Date.now() })
      })

      emitter.on('interrupt', async signal => {
        postMortemPath = await gen.generate(trace, signal)
      })

      // Replay the trace spans through the detector
      for (const span of trace.spans) {
        detector.check(span.name)
      }

      // Wait for async file write
      await new Promise(r => setTimeout(r, 50))

      expect(postMortemPath).not.toBeNull()
      expect(existsSync(postMortemPath!)).toBe(true)

      const content = readFileSync(postMortemPath!, 'utf-8')
      expect(content).toContain(trace.id)
      expect(content).toContain('plan')
      expect(content).toContain('search')
      expect(content).toContain('execute')
    })
  })
})
