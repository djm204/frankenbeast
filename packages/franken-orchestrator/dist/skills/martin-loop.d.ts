/**
 * MartinLoop — the smarter loop.
 *
 * Named after Martin because Ralph was too naive for the job:
 *   - Ralph hardcoded two providers and called it a day.
 *   - Martin uses a pluggable ProviderRegistry — add a new AI agent
 *     by dropping in an ICliProvider, not by editing a god function.
 *   - Ralph panicked on rate limits. Martin gracefully cascades through
 *     a provider fallback chain, parses retry-after headers from every
 *     provider dialect, sleeps the minimum time, then picks back up.
 *   - Ralph dumped raw JSON to the terminal. Martin streams clean text
 *     in real-time through StreamLineBuffer with thinking content dimmed.
 *   - Ralph let plugins poison his child processes. Martin sets
 *     FRANKENBEAST_SPAWNED=1 so rogue plugins know to stand down.
 *
 * Rest in peace, Ralph. You were a good first draft.
 */
import type { MartinLoopConfig, MartinLoopResult } from './cli-types.js';
import { ProviderRegistry } from './providers/cli-provider.js';
export declare function parseResetTime(stderr: string, stdout: string): {
    sleepSeconds: number;
    source: string;
};
/**
 * Process a single complete line from stream-json output.
 * If it's valid JSON, extract text content. If plain text, pass through.
 * Returns empty string for non-text JSON frames or blank lines.
 */
export declare function processStreamLine(line: string): string;
/**
 * Line-buffered processor for stream-json output.
 * Accumulates bytes until newline, then processes each complete line
 * through processStreamLine. Partial lines are held until completed.
 *
 * Tracks tool-use blocks: when a `content_block_start` with `type: "tool_use"`
 * is seen, subsequent `input_json_delta` frames are accumulated silently and a
 * compact summary is emitted on `content_block_stop`. Tool-result blocks are
 * suppressed entirely to avoid dumping file contents to the terminal.
 */
export declare class StreamLineBuffer {
    private buffer;
    /** Active tool-use block state, keyed by content_block index. */
    private activeToolUse;
    /** Set of content_block indices that are tool_result blocks (suppressed). */
    private suppressedIndices;
    /** Push raw data. Returns array of clean text strings (empty entries filtered out). */
    push(data: string): string[];
    /** Flush remaining buffer as plain text. */
    flush(): string[];
    /** Process a single line with tool-use state tracking. Returns null to suppress output. */
    private processLine;
}
export declare class MartinLoop {
    private readonly registry;
    constructor(registry?: ProviderRegistry);
    run(config: MartinLoopConfig): Promise<MartinLoopResult>;
}
//# sourceMappingURL=martin-loop.d.ts.map