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
    this.windowSize = LoopDetector.validatePositiveInteger('windowSize', options.windowSize ?? 3)
    this.repeatThreshold = LoopDetector.validatePositiveInteger('repeatThreshold', options.repeatThreshold ?? 3)
    this.similarityThreshold = LoopDetector.validateThreshold('similarityThreshold', options.similarityThreshold ?? 0.85)
    this.maxGapBetweenRepetitions = LoopDetector.validateNonNegativeInteger(
      'maxGapBetweenRepetitions',
      options.maxGapBetweenRepetitions ?? 1,
    )
    const configuredHistoryLimit = LoopDetector.validatePositiveInteger('historyLimit', options.historyLimit ?? 100)
    // Never retain fewer spans than a full detection span needs, otherwise
    // check() would trim history below detectLoop()'s minLength gate and no
    // loop could ever be reported for larger window/threshold configurations.
    const spanNeededForDetection =
      this.windowSize * this.repeatThreshold +
      Math.max(0, this.repeatThreshold - 1) * this.maxGapBetweenRepetitions
    this.historyLimit = Math.max(configuredHistoryLimit, spanNeededForDetection)
  }

  private static validatePositiveInteger(optionName: string, value: number): number {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${optionName} must be a finite positive integer`)
    }

    return value
  }

  private static validateNonNegativeInteger(optionName: string, value: number): number {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new RangeError(`${optionName} must be a finite non-negative integer`)
    }

    return value
  }

  private static validateThreshold(optionName: string, value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${optionName} must be a finite number between 0 and 1`)
    }

    return value
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

    // Names that differ only by ordinal counters (e.g. `step-1` vs `step-2`,
    // `iter-1` vs `iter-9`) represent normal progression, not a loop. Without
    // this guard the fuzzy match below would also collapse them into a fake
    // loop because the edit distance is tiny.
    if (LoopDetector.maskDigits(normalizedLeft) === LoopDetector.maskDigits(normalizedRight)) {
      return false
    }

    if (normalizedLeft.length < 6 || normalizedRight.length < 6) {
      return false
    }

    return LoopDetector.similarity(normalizedLeft, normalizedRight) >= this.similarityThreshold
  }

  private static maskDigits(value: string): string {
    return value.replace(/\d+/g, '#')
  }

  private static normalizeSpanName(spanName: string): string {
    return spanName
      .toLowerCase()
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '#')
      .replace(/\b0x[0-9a-f]+\b/g, '#')
      .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds|tokens?|bytes?|kb|mb)\b/g, '#')
      // Collapse volatile metadata values written as `key=value`
      // (e.g. `tokens=504`) so changing counts don't defeat loop detection.
      // Bare ordinal suffixes like `iter-1` are intentionally left intact and
      // handled by the digit-mask guard in spanNamesMatch(). `:` is the span
      // namespace separator here, so it is deliberately excluded.
      .replace(/=\s*\d+(?:\.\d+)?\b/g, '=#')
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
