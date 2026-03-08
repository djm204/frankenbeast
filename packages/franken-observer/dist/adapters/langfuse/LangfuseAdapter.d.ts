import type { ExportAdapter } from '../../export/ExportAdapter.js';
import type { Trace } from '../../core/types.js';
export type FetchFn = (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}) => Promise<{
    ok: boolean;
    status: number;
    statusText?: string;
}>;
export interface LangfuseAdapterOptions {
    /** Langfuse host. Default: 'https://cloud.langfuse.com' */
    baseUrl?: string;
    publicKey: string;
    secretKey: string;
    /** Injectable for testing. Defaults to globalThis.fetch. */
    fetch?: FetchFn;
}
/**
 * Write-only ExportAdapter that POSTs OTEL trace payloads to a Langfuse
 * (or Phoenix) ingest endpoint over HTTP. queryByTraceId / listTraceIds
 * return null / [] because Langfuse is a push-only sink from this SDK's
 * perspective.
 */
export declare class LangfuseAdapter implements ExportAdapter {
    private readonly baseUrl;
    private readonly authHeader;
    private readonly fetchFn;
    constructor(options: LangfuseAdapterOptions);
    flush(trace: Trace): Promise<void>;
    queryByTraceId(_traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=LangfuseAdapter.d.ts.map