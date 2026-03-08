import type { IAdapter } from "./i-adapter.js";
import type { Provider } from "../config/index.js";
import type { GuardrailViolation } from "../types/index.js";
export declare class AdapterRegistryError extends Error implements GuardrailViolation {
    readonly code: "PROVIDER_NOT_ALLOWED";
    readonly interceptor: "Pipeline";
    readonly payload: Record<string, unknown>;
    constructor(message: string, payload?: Record<string, unknown>);
}
export declare class AdapterRegistry {
    private readonly registry;
    private readonly allowedProviders;
    constructor(allowedProviders: Provider[]);
    register(provider: Provider, adapter: IAdapter): void;
    getAdapter(provider: string): IAdapter;
}
//# sourceMappingURL=adapter-registry.d.ts.map