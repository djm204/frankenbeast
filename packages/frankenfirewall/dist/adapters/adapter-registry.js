export class AdapterRegistryError extends Error {
    code = "PROVIDER_NOT_ALLOWED";
    interceptor = "Pipeline";
    payload;
    constructor(message, payload = {}) {
        super(message);
        this.name = "AdapterRegistryError";
        this.payload = payload;
    }
}
export class AdapterRegistry {
    registry = new Map();
    allowedProviders;
    constructor(allowedProviders) {
        this.allowedProviders = new Set(allowedProviders);
    }
    register(provider, adapter) {
        this.registry.set(provider, adapter);
    }
    getAdapter(provider) {
        if (!this.allowedProviders.has(provider)) {
            throw new AdapterRegistryError(`Provider "${provider}" is not in the allowed_providers list`, { provider, allowed: [...this.allowedProviders] });
        }
        const adapter = this.registry.get(provider);
        if (!adapter) {
            throw new AdapterRegistryError(`Provider "${provider}" is allowed but has no registered adapter`, { provider });
        }
        return adapter;
    }
}
//# sourceMappingURL=adapter-registry.js.map