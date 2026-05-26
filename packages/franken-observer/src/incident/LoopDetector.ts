export interface LoopDetectionResult {
  detected: boolean
  detectedPattern: string[]
  repetitions: number
}

export interface LoopDetectorOptions {
  /** Number of spans in a single repeating window. Default: 3. */
  windowSize?: number
  /** How many repetitions trigger detection. Default: 3. */
  repeatThreshold?: number
  /** Minimum normalized string similarity for fuzzy span-name matches. Default: 0.85. */
  similarityThreshold?: number
  /** Number of unrelated spans allowed between repeated pattern windows. Default: 1. */
  maxGapBetweenRepetitions?: number
  /** Maximum span names retained for loop detection. Default: 100. */
  historyLimit?: number
}

type LoopHandler = (result: LoopDetectionResult) => void

/**
 * Detects repeating span-name patterns using a sliding-window comparison.
 * Non-blocking: fires event handlers synchronously, never throws.
 */
export class LoopDetector {
  private readonly windowSize: number
  private readonly repeatThreshold: number
  private readonly similarityThreshold: number
  private readonly maxGapBetweenRepetitions: number
  private readonly historyLimit: number
  private readonly handlers = new Set<LoopHandler>()
  private history: string[] = []

  constructor(options: LoopDetectorOptions = {}) {
    this.windowSize = options.windowSize ?? 3
    this.repeatThreshold = options.repeatThreshold ?? 3
    this.similarityThreshold = options.similarityThreshold ?? 0.85
    this.maxGapBetweenRepetitions = options.maxGapBetweenRepetitions ?? 1
    this.historyLimit = options.historyLimit ?? 100
  }

  check(spanName: string): LoopDetectionResult {
    this.history.push(spanName)
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(-this.historyLimit)
    }

    const result = this.detectLoop()
    if (!result.detected) {
      return result
    }

    for (const handler of this.handlers) {
      handler(result)
    }

    return result
  }

  private detectLoop(): LoopDetectionResult {
    const minLength = this.windowSize * this.repeatThreshold
    if (this.history.length < minLength) {
      return { detected: false, detectedPattern: [], repetitions: 0 }
    }

    const latestPatternStart = this.history.length - this.windowSize

    for (let start = 0; start <= latestPatternStart; start += 1) {
      const pattern = this.history.slice(start, start + this.windowSize)
      let repetitions = 1
      let cursor = start + this.windowSize

      while (repetitions < this.repeatThreshold) {
        const nextStart = this.findNextPatternStart(pattern, cursor)
        if (nextStart === undefined) {
          break
        }

        repetitions += 1
        cursor = nextStart + this.windowSize
      }

      if (repetitions >= this.repeatThreshold && cursor === this.history.length) {
        return {
          detected: true,
          detectedPattern: pattern,
          repetitions,
        }
      }
    }

    return { detected: false, detectedPattern: [], repetitions: 0 }
  }

  private findNextPatternStart(pattern: string[], searchStart: number): number | undefined {
    const latestPatternStart = this.history.length - this.windowSize
    const latestAllowedStart = Math.min(
      latestPatternStart,
      searchStart + this.maxGapBetweenRepetitions,
    )

    for (let candidate = searchStart; candidate <= latestAllowedStart; candidate += 1) {
      if (this.windowMatches(pattern, candidate)) {
        return candidate
      }
    }

    return undefined
  }

  private windowMatches(pattern: string[], start: number): boolean {
    return pattern.every((spanName, index) => this.spanNamesMatch(spanName, this.history[start + index]))
  }

  private spanNamesMatch(left: string, right: string): boolean {
    const normalizedLeft = LoopDetector.normalizeSpanName(left)
    const normalizedRight = LoopDetector.normalizeSpanName(right)

    if (normalizedLeft === normalizedRight) {
      return true
    }

    if (normalizedLeft.length < 6 || normalizedRight.length < 6) {
      return false
    }

    return LoopDetector.similarity(normalizedLeft, normalizedRight) >= this.similarityThreshold
  }

  private static normalizeSpanName(spanName: string): string {
    return spanName
      .toLowerCase()
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '#')
      .replace(/\b0x[0-9a-f]+\b/g, '#')
      .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds|tokens?|bytes?|kb|mb)?\b/g, '#')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private static similarity(left: string, right: string): number {
    const maxLength = Math.max(left.length, right.length)
    if (maxLength === 0) {
      return 1
    }

    return 1 - LoopDetector.levenshteinDistance(left, right) / maxLength
  }

  private static levenshteinDistance(left: string, right: string): number {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      let upperLeft = previous[0]
      previous[0] = leftIndex + 1

      for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
        const upper = previous[rightIndex + 1]
        const cost = left[leftIndex] === right[rightIndex] ? 0 : 1
        previous[rightIndex + 1] = Math.min(previous[rightIndex + 1] + 1, previous[rightIndex] + 1, upperLeft + cost)
        upperLeft = upper
      }
    }

    return previous[right.length]
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
