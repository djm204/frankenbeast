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
export class WebhookNotifier {
    url;
    extraHeaders;
    fetchFn;
    retry;
    sleepFn;
    constructor(options) {
        this.url = options.url;
        this.extraHeaders = options.headers ?? {};
        this.fetchFn = options.fetch ?? globalThis.fetch;
        this.sleepFn = options.sleep ?? ((ms) => new Promise(r => setTimeout(r, ms)));
        this.retry = options.retry
            ? {
                maxRetries: options.retry.maxRetries,
                baseDelayMs: options.retry.baseDelayMs ?? 200,
                maxDelayMs: options.retry.maxDelayMs ?? 30_000,
                jitter: options.retry.jitter ?? true,
            }
            : null;
    }
    async send(payload) {
        const maxAttempts = this.retry ? 1 + this.retry.maxRetries : 1;
        let lastError;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0 && this.retry) {
                const { baseDelayMs, maxDelayMs, jitter } = this.retry;
                const base = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
                const delay = jitter ? base + Math.random() * baseDelayMs : base;
                await this.sleepFn(delay);
            }
            try {
                const response = await this.fetchFn(this.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...this.extraHeaders,
                    },
                    body: JSON.stringify(payload),
                });
                if (!response.ok) {
                    lastError = new Error(`Webhook delivery failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
                    continue;
                }
                return;
            }
            catch (err) {
                lastError = err;
            }
        }
        throw lastError;
    }
}
//# sourceMappingURL=WebhookNotifier.js.map