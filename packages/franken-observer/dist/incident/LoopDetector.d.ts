export interface LoopDetectionResult {
    detected: boolean;
    detectedPattern: string[];
    repetitions: number;
}
export interface LoopDetectorOptions {
    /** Number of spans in a single repeating window. Default: 3. */
    windowSize?: number;
    /** How many consecutive repetitions trigger detection. Default: 3. */
    repeatThreshold?: number;
}
type LoopHandler = (result: LoopDetectionResult) => void;
/**
 * Detects repeating span-name patterns using a sliding-window comparison.
 * Non-blocking: fires event handlers synchronously, never throws.
 */
export declare class LoopDetector {
    private readonly windowSize;
    private readonly repeatThreshold;
    private readonly handlers;
    private history;
    constructor(options?: LoopDetectorOptions);
    check(spanName: string): LoopDetectionResult;
    on(event: 'loop-detected', handler: LoopHandler): void;
    off(event: 'loop-detected', handler: LoopHandler): void;
    reset(): void;
}
export {};
//# sourceMappingURL=LoopDetector.d.ts.map