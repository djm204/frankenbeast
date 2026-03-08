import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js';
export interface WebhookRetryOptions {
    /** Maximum number of retry attempts after the initial try. Default: 0 (no retry). */
    maxRetries: number;
    /** Base delay in milliseconds before the first retry. Default: 200. */
    baseDelayMs?: number;
    /** Maximum delay cap in milliseconds. Default: 30000. */
    maxDelayMs?: number;
    /**
     * Add a random jitter of up to `baseDelayMs` to each delay to avoid
     * thundering-herd on shared endpoints. Default: true.
     */
    jitter?: boolean;
}
export interface WebhookNotifierOptions {
    /** URL to POST the JSON payload to. */
    url: string;
    /**
     * Additional HTTP headers merged on every request.
     * Content-Type is set to application/json by default and can be
     * overridden here.
     */
    headers?: Record<string, string>;
    /** Injectable for testing. Defaults to globalThis.fetch. */
    fetch?: FetchFn;
    /** Retry configuration. Omit to send exactly once (backwards-compatible). */
    retry?: WebhookRetryOptions;
    /**
     * Injectable sleep function for testing retry delays without real timers.
     * Defaults to a Promise-based `setTimeout` wrapper.
     */
    sleep?: (ms: number) => Promise<void>;
}
/**
 * Delivers HITL signals (CircuitBreaker, LoopDetector) to external systems
 * over HTTP. Any JSON-serialisable payload can be sent.
 *
 * send() throws on non-2xx responses and network errors. For fire-and-forget
 * use inside event handlers, suppress the rejection with `void`:
 *
 * ```ts
 * circuitBreaker.on('limit-reached', result => {
 *   void notifier.send({ type: 'circuit-breaker', ...result })
 *     .catch(err => console.error('webhook failed', err))
 * })
 * ```
 *
 * Configure retry with exponential backoff:
 *
 * ```ts
 * const notifier = new WebhookNotifier({
 *   url: 'https://hooks.example.com/signal',
 *   retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 5000 },
 * })
 * ```
 */
export declare class WebhookNotifier {
    private readonly url;
    private readonly extraHeaders;
    private readonly fetchFn;
    private readonly retry;
    private readonly sleepFn;
    constructor(options: WebhookNotifierOptions);
    send(payload: unknown): Promise<void>;
}
//# sourceMappingURL=WebhookNotifier.d.ts.map