import type { BeastContext } from '../context/franken-context.js';
import type { IFirewallModule, ILogger } from '../deps.js';
export declare class InjectionDetectedError extends Error {
    readonly violations: readonly {
        rule: string;
        severity: string;
        detail: string;
    }[];
    constructor(violations: readonly {
        rule: string;
        severity: string;
        detail: string;
    }[]);
}
/**
 * Beast Loop Phase 1a: Ingestion
 * Sends raw user input through the firewall pipeline.
 * If blocked (injection detected), throws InjectionDetectedError.
 * Otherwise, stores sanitised intent on the context.
 */
export declare function runIngestion(ctx: BeastContext, firewall: IFirewallModule, logger?: ILogger): Promise<void>;
//# sourceMappingURL=ingestion.d.ts.map