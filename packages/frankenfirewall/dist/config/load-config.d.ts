import type { GuardrailsConfig } from "./guardrails-config.js";
export declare class ConfigError extends Error {
    constructor(message: string);
}
export declare function loadConfig(filePath: string): GuardrailsConfig;
//# sourceMappingURL=load-config.d.ts.map