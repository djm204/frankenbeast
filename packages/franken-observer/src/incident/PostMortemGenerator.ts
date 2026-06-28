import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import type { Trace } from '../core/types.js'
import type { InterruptSignal } from './InterruptEmitter.js'

export interface PostMortemOptions {
  /** Directory where post-mortem files are written. Default: './post-mortems' */
  outputDir?: string
}

/**
 * Generates a markdown post-mortem report when an agent loop is detected.
 * generateContent() builds the markdown string (pure, no I/O).
 * generate() writes it to disk and returns the file path, or `null` if the
 * write failed (e.g. disk full or read-only directory). A write failure is
 * logged and degraded gracefully so it never crashes the agent loop.
 */
export class PostMortemGenerator {
  private readonly outputDir: string

  constructor(options: PostMortemOptions = {}) {
    this.outputDir = options.outputDir ?? './post-mortems'
  }

  generateContent(trace: Trace, signal: InterruptSignal): string {
    const detectedAt = new Date(signal.timestamp).toISOString()
    const patternList = signal.detectedPattern.map(p => `  - \`${p}\``).join('\n')

    const spansTable = trace.spans
      .map((s, i) => {
        const dur = s.durationMs !== undefined ? `${s.durationMs}ms` : 'N/A'
        return `| ${i + 1} | \`${s.name}\` | ${s.status} | ${dur} |`
      })
      .join('\n')

    return `# Post-Mortem Report

**Trace ID:** \`${trace.id}\`
**Goal:** ${trace.goal}
**Detected at:** ${detectedAt}

---

## Detected Loop Pattern

The agent entered an infinite loop executing the following span sequence
**${signal.repetitions} times** without progressing:

${patternList}

---

## Trace Replay

| # | Span | Status | Duration |
|---|------|--------|----------|
${spansTable}

---

## Logic Failure Analysis

The agent repeatedly executed the pattern \`${signal.detectedPattern.join(' → ')}\`
without reaching a terminal condition. Possible causes:

- The tool calls within this cycle are not returning the expected output.
- The planner (MOD-04) did not receive a clear stopping signal.
- A prerequisite for the next step was never satisfied.

**Action taken:** MOD-05 sent an interrupt signal to the Planner to halt execution.
`
  }

  /**
   * Writes the post-mortem to disk. Returns the file path on success, or
   * `null` if the directory could not be created or the file could not be
   * written (e.g. ENOSPC disk full, EACCES/EROFS read-only). Failures are
   * logged rather than thrown so a reporting failure never crashes the loop
   * the post-mortem was meant to diagnose.
   */
  async generate(trace: Trace, signal: InterruptSignal): Promise<string | null> {
    const timestamp = signal.timestamp
    const filename = `post-mortem-${trace.id}-${timestamp}.md`
    const filePath = join(this.outputDir, filename)
    const content = this.generateContent(trace, signal)

    try {
      await fs.mkdir(this.outputDir, { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
      return filePath
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(
        `[PostMortemGenerator] Failed to write post-mortem for trace ${trace.id} to ${filePath}: ${reason}. Continuing without persisting the report.`,
      )
      return null
    }
  }
}
