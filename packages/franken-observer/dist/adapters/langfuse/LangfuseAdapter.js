import { OTELSerializer } from '../../export/OTELSerializer.js';
/**
 * Write-only ExportAdapter that POSTs OTEL trace payloads to a Langfuse
 * (or Phoenix) ingest endpoint over HTTP. queryByTraceId / listTraceIds
 * return null / [] because Langfuse is a push-only sink from this SDK's
 * perspective.
 */
export class LangfuseAdapter {
    baseUrl;
    authHeader;
    fetchFn;
    constructor(options) {
        this.baseUrl = (options.baseUrl ?? 'https://cloud.langfuse.com').replace(/\/$/, '');
        this.authHeader = `Basic ${Buffer.from(`${options.publicKey}:${options.secretKey}`).toString('base64')}`;
        this.fetchFn = options.fetch ?? globalThis.fetch;
    }
    async flush(trace) {
        const payload = OTELSerializer.serializeTrace(trace);
        const url = `${this.baseUrl}/api/public/otel/v1/traces`;
        const response = await this.fetchFn(url, {
            method: 'POST',
            headers: {
                Authorization: this.authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`Langfuse export failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
        }
    }
    async queryByTraceId(_traceId) {
        return null;
    }
    async listTraceIds() {
        return [];
    }
}
//# sourceMappingURL=LangfuseAdapter.js.map