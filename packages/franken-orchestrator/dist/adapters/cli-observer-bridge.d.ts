import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { ObserverDeps } from '../skills/cli-skill-executor.js';
export interface CliObserverBridgeConfig {
    budgetLimitUsd: number;
}
export declare class CliObserverBridge implements IObserverModule {
    private readonly counter;
    private readonly costCalc;
    private readonly breaker;
    private readonly loopDet;
    private trace;
    constructor(config: CliObserverBridgeConfig);
    startTrace(sessionId: string): void;
    startSpan(name: string): SpanHandle;
    getTokenSpend(_sessionId: string): Promise<TokenSpendData>;
    get observerDeps(): ObserverDeps;
    private requireTrace;
}
//# sourceMappingURL=cli-observer-bridge.d.ts.map