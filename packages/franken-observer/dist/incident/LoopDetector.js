/**
 * Detects repeating span-name patterns using a sliding-window comparison.
 * Non-blocking: fires event handlers synchronously, never throws.
 */
export class LoopDetector {
    windowSize;
    repeatThreshold;
    handlers = new Set();
    history = [];
    constructor(options = {}) {
        this.windowSize = options.windowSize ?? 3;
        this.repeatThreshold = options.repeatThreshold ?? 3;
    }
    check(spanName) {
        this.history.push(spanName);
        const minLength = this.windowSize * this.repeatThreshold;
        if (this.history.length < minLength) {
            return { detected: false, detectedPattern: [], repetitions: 0 };
        }
        // Examine the most recent minLength entries
        const tail = this.history.slice(-minLength);
        const pattern = tail.slice(0, this.windowSize);
        const allMatch = Array.from({ length: this.repeatThreshold }, (_, i) => pattern.every((p, j) => p === tail[i * this.windowSize + j])).every(Boolean);
        if (!allMatch) {
            return { detected: false, detectedPattern: [], repetitions: 0 };
        }
        const result = {
            detected: true,
            detectedPattern: pattern,
            repetitions: this.repeatThreshold,
        };
        for (const handler of this.handlers) {
            handler(result);
        }
        return result;
    }
    on(event, handler) {
        this.handlers.add(handler);
    }
    off(event, handler) {
        this.handlers.delete(handler);
    }
    reset() {
        this.history = [];
    }
}
//# sourceMappingURL=LoopDetector.js.map