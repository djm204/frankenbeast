import { writeFile, mkdir } from 'node:fs/promises'
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
 * generate() writes it to disk and returns the file path.
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

  async generate(trace: Trace, signal: InterruptSignal): Promise<string> {
    await mkdir(this.outputDir, { recursive: true })
    const timestamp = signal.timestamp
    const filename = `post-mortem-${trace.id}-${timestamp}.md`
    const filePath = join(this.outputDir, filename)
    const content = this.generateContent(trace, signal)
    await writeFile(filePath, content, 'utf-8')
    return filePath
  }
}
