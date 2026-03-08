import type { Trace } from '../core/types.js';
import type { InterruptSignal } from './InterruptEmitter.js';
export interface PostMortemOptions {
    /** Directory where post-mortem files are written. Default: './post-mortems' */
    outputDir?: string;
}
/**
 * Generates a markdown post-mortem report when an agent loop is detected.
 * generateContent() builds the markdown string (pure, no I/O).
 * generate() writes it to disk and returns the file path.
 */
export declare class PostMortemGenerator {
    private readonly outputDir;
    constructor(options?: PostMortemOptions);
    generateContent(trace: Trace, signal: InterruptSignal): string;
    generate(trace: Trace, signal: InterruptSignal): Promise<string>;
}
//# sourceMappingURL=PostMortemGenerator.d.ts.map