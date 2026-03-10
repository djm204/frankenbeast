export interface LoopDetectionResult {
  detected: boolean
  detectedPattern: string[]
  repetitions: number
}

export interface LoopDetectorOptions {
  /** Number of spans in a single repeating window. Default: 3. */
  windowSize?: number
  /** How many consecutive repetitions trigger detection. Default: 3. */
  repeatThreshold?: number
}

type LoopHandler = (result: LoopDetectionResult) => void

/**
 * Detects repeating span-name patterns using a sliding-window comparison.
 * Non-blocking: fires event handlers synchronously, never throws.
 */
export class LoopDetector {
  private readonly windowSize: number
  private readonly repeatThreshold: number
  private readonly handlers = new Set<LoopHandler>()
  private history: string[] = []

  constructor(options: LoopDetectorOptions = {}) {
    this.windowSize = options.windowSize ?? 3
    this.repeatThreshold = options.repeatThreshold ?? 3
  }

  check(spanName: string): LoopDetectionResult {
    this.history.push(spanName)

    const minLength = this.windowSize * this.repeatThreshold
    if (this.history.length < minLength) {
      return { detected: false, detectedPattern: [], repetitions: 0 }
    }

    // Examine the most recent minLength entries
    const tail = this.history.slice(-minLength)
    const pattern = tail.slice(0, this.windowSize)

    const allMatch = Array.from({ length: this.repeatThreshold }, (_, i) =>
      pattern.every((p, j) => p === tail[i * this.windowSize + j]),
    ).every(Boolean)

    if (!allMatch) {
      return { detected: false, detectedPattern: [], repetitions: 0 }
    }

    const result: LoopDetectionResult = {
      detected: true,
      detectedPattern: pattern,
      repetitions: this.repeatThreshold,
    }

    for (const handler of this.handlers) {
      handler(result)
    }

    return result
  }

  on(event: 'loop-detected', handler: LoopHandler): void {
    this.handlers.add(handler)
  }

  off(event: 'loop-detected', handler: LoopHandler): void {
    this.handlers.delete(handler)
  }

  reset(): void {
    this.history = []
  }
}
