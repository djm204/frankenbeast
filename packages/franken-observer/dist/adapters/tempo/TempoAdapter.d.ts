import type { ExportAdapter } from '../../export/ExportAdapter.js';
import type { Trace } from '../../core/types.js';
import type { FetchFn } from '../langfuse/LangfuseAdapter.js';
export interface TempoBasicAuth {
    /** Grafana Cloud instance ID (numeric string) or a username. */
    user: string;
    /** Grafana Cloud API key or password. */
    password: string;
}
export interface TempoAdapterOptions {
    /**
     * Base URL of the Tempo or OTLP/HTTP collector endpoint.
     *
     * Examples:
     * - Grafana Cloud:  `'https://tempo-us-central1.grafana.net/tempo'`
     * - Local Tempo:    `'http://localhost:4318'`
     */
    endpoint: string;
    /**
     * OTLP/HTTP traces path appended to `endpoint`.
     * Default: `'/v1/traces'`
     *
     * For Grafana Cloud you typically need `'/otlp/v1/traces'`.
     */
    otlpPath?: string;
    /** HTTP Basic auth credentials. Omit for unauthenticated local Tempo. */
    basicAuth?: TempoBasicAuth;
    /** Injectable for testing. Defaults to globalThis.fetch. */
    fetch?: FetchFn;
}
/**
 * Write-only ExportAdapter that POSTs OTEL trace payloads to a Grafana Tempo
 * (or any OTLP/HTTP-compatible) endpoint.
 *
 * queryByTraceId / listTraceIds return null / [] — Tempo is a push-only
 * sink from this SDK's perspective.
 */
export declare class TempoAdapter implements ExportAdapter {
    private readonly tracesUrl;
    private readonly authHeader;
    private readonly fetchFn;
    constructor(options: TempoAdapterOptions);
    flush(trace: Trace): Promise<void>;
    queryByTraceId(_traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
}
//# sourceMappingURL=TempoAdapter.d.ts.map