import type { Trace } from '../core/types.js';
import type { ExportAdapter } from './ExportAdapter.js';
/**
 * Zero-dependency in-process adapter. Useful in tests and as a
 * fallback when no persistent backend is configured.
 */
export declare class InMemoryAdapter implements ExportAdapter {
    private readonly store;
    flush(trace: Trace): Promise<void>;
    queryByTraceId(traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=InMemoryAdapter.d.ts.map