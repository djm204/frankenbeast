import { Hono } from 'hono';
import type { GuardrailsConfig } from '../config/index.js';
import type { IAdapter } from '../adapters/index.js';
export interface FirewallAppOptions {
    config: GuardrailsConfig;
    adapters: Record<string, IAdapter>;
    defaultProvider?: string;
}
type AppEnv = {
    Variables: {
        requestId: string;
    };
};
export declare function createFirewallApp(options: FirewallAppOptions): Hono<AppEnv>;
export {};
//# sourceMappingURL=app.d.ts.map