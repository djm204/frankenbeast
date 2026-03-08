/**
 * Non-blocking budget guard. Emits a 'limit-reached' event when
 * cumulative spend exceeds the configured USD limit. Never throws.
 */
export class CircuitBreaker {
    limitUsd;
    handlers = new Set();
    constructor(options) {
        this.limitUsd = options.limitUsd;
    }
    check(spendUsd) {
        const result = {
            tripped: spendUsd > this.limitUsd,
            limitUsd: this.limitUsd,
            spendUsd,
        };
        if (result.tripped) {
            for (const handler of this.handlers) {
                handler(result);
            }
        }
        return result;
    }
    on(event, handler) {
        this.handlers.add(handler);
    }
    off(event, handler) {
        this.handlers.delete(handler);
    }
}
//# sourceMappingURL=CircuitBreaker.js.map