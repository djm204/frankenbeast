import { OTELSerializer } from '../../export/OTELSerializer.js';
/**
 * Write-only ExportAdapter that POSTs OTEL trace payloads to a Grafana Tempo
 * (or any OTLP/HTTP-compatible) endpoint.
 *
 * queryByTraceId / listTraceIds return null / [] — Tempo is a push-only
 * sink from this SDK's perspective.
 */
export class TempoAdapter {
    tracesUrl;
    authHeader;
    fetchFn;
    constructor(options) {
        const base = options.endpoint.replace(/\/$/, '');
        const path = options.otlpPath ?? '/v1/traces';
        this.tracesUrl = `${base}${path}`;
        if (options.basicAuth) {
            const { user, password } = options.basicAuth;
            this.authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
        }
        this.fetchFn = options.fetch ?? globalThis.fetch;
    }
    async flush(trace) {
        const payload = OTELSerializer.serializeTrace(trace);
        const headers = { 'Content-Type': 'application/json' };
        if (this.authHeader)
            headers['Authorization'] = this.authHeader;
        const response = await this.fetchFn(this.tracesUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`Tempo export failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
        }
    }
    async queryByTraceId(_traceId) {
        return null;
    }
    async listTraceIds() {
        return [];
    }
}
//# sourceMappingURL=TempoAdapter.js.map