import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
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

function isInsideDirectory(baseDir: string, targetPath: string): boolean {
  const relativePath = relative(resolve(baseDir), resolve(targetPath))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function makeTraceWithId(id: string) {
  const trace = makeTrace()
  trace.id = id
  for (const span of trace.spans) {
    span.traceId = id
  }
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
      expect(filePath).not.toBeNull()
      expect(existsSync(filePath!)).toBe(true)
      expect(filePath!.endsWith('.md')).toBe(true)
    })

    it('filename contains the trace id', async () => {
      const gen = new PostMortemGenerator({ outputDir })
      const trace = makeTrace()
      const filePath = await gen.generate(trace, makeSignal(trace.id))
      expect(filePath).not.toBeNull()
      expect(filePath!).toContain(trace.id)
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
      expect(existsSync(filePath!)).toBe(true)
    })

    it('keeps reports under outputDir when trace ids contain traversal, absolute paths, or separators', async () => {
      const parentDir = join(tmpdir(), `pm-parent-${randomUUID()}`)
      const containedOutputDir = join(parentDir, 'reports')
      const maliciousIds = [
        `trace${sep}..${sep}..${sep}escaped`,
        join(tmpdir(), 'absolute-trace-id'),
        'slash/and\\backslash',
      ]

      try {
        for (const traceId of maliciousIds) {
          const gen = new PostMortemGenerator({ outputDir: containedOutputDir })
          const trace = makeTraceWithId(traceId)
          const filePath = await gen.generate(trace, makeSignal(trace.id))

          expect(filePath).not.toBeNull()
          expect(isInsideDirectory(containedOutputDir, filePath!)).toBe(true)
          expect(existsSync(filePath!)).toBe(true)
        }

        const escapedReports = maliciousIds.map(
          traceId => resolve(containedOutputDir, `post-mortem-${traceId}-1700000000000.md`),
        )
        expect(escapedReports.some(path => !isInsideDirectory(containedOutputDir, path) && existsSync(path))).toBe(false)
      } finally {
        rmSync(parentDir, { recursive: true, force: true })
      }
    })

    it('enforces containment when outputDir is a symlink', async () => {
      const parentDir = join(tmpdir(), `pm-symlink-parent-${randomUUID()}`)
      const realOutputDir = join(parentDir, 'real-reports')
      const symlinkedOutputDir = join(parentDir, 'reports-link')
      mkdirSync(realOutputDir, { recursive: true })
      symlinkSync(realOutputDir, symlinkedOutputDir, 'dir')

      try {
        const gen = new PostMortemGenerator({ outputDir: symlinkedOutputDir })
        const trace = makeTraceWithId(`trace${sep}..${sep}..${sep}escaped-from-symlink`)
        const filePath = await gen.generate(trace, makeSignal(trace.id))

        expect(filePath).not.toBeNull()
        expect(isInsideDirectory(realOutputDir, filePath!)).toBe(true)
        expect(existsSync(filePath!)).toBe(true)

        const escapedPath = resolve(realOutputDir, `post-mortem-${trace.id}-1700000000000.md`)
        expect(isInsideDirectory(realOutputDir, escapedPath)).toBe(false)
        expect(existsSync(escapedPath)).toBe(false)
      } finally {
        rmSync(parentDir, { recursive: true, force: true })
      }
    })
  })

  describe('generate() error handling (disk full / read-only)', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('does not throw and returns null when the directory cannot be created', async () => {
      // Make the parent of outputDir a regular file, so recursive mkdir fails
      // with ENOTDIR — the same unrecoverable class as a read-only filesystem.
      const blocker = join(tmpdir(), `pm-block-${randomUUID()}`)
      writeFileSync(blocker, 'not a directory')
      const gen = new PostMortemGenerator({ outputDir: join(blocker, 'reports') })
      const trace = makeTrace()

      let result: string | null
      try {
        result = await gen.generate(trace, makeSignal(trace.id))
      } finally {
        rmSync(blocker, { force: true })
      }

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
    })

    it('does not throw and returns null when the file cannot be written', async () => {
      // Pre-create a *directory* at the exact target file path so writeFile
      // fails with EISDIR — mimics a disk-full / unwritable target without mocks.
      const trace = makeTrace()
      const sig = makeSignal(trace.id)
      const filename = `post-mortem-${trace.id}-${sig.timestamp}.md`
      mkdirSync(join(outputDir, filename), { recursive: true })

      const gen = new PostMortemGenerator({ outputDir })
      const result = await gen.generate(trace, sig)

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
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

      const postMortemDone = new Promise<string>(resolve => {
        emitter.on('interrupt', async signal => {
          const generatedPath = await gen.generate(trace, signal)
          if (typeof generatedPath === 'string') resolve(generatedPath)
        })
      })

      detector.on('loop-detected', result => {
        emitter.emit({ traceId: trace.id, ...result, timestamp: Date.now() })
      })

      // Replay the trace spans through the detector
      for (const span of trace.spans) {
        detector.check(span.name)
      }

      const postMortemPath = await postMortemDone

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
