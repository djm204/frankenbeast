import type { FirewallResult } from '../deps.js';
/**
 * Injection breaker: checks every firewall pipeline result.
 * If blocked, signals immediate halt.
 */
export declare function checkInjection(result: FirewallResult): {
    halt: boolean;
    reason?: string;
};
//# sourceMappingURL=injection-breaker.d.ts.map