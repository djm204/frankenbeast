import type { IAdapter } from "./i-adapter.js";
import type { Provider } from "../config/index.js";
import type { GuardrailViolation } from "../types/index.js";

export class AdapterRegistryError extends Error implements GuardrailViolation {
  readonly code = "PROVIDER_NOT_ALLOWED" as const;
  readonly interceptor = "Pipeline" as const;
  readonly payload: Record<string, unknown>;

  constructor(
    message: string,
    payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AdapterRegistryError";
    this.payload = payload;
  }
}

export class AdapterRegistry {
  private readonly registry = new Map<string, IAdapter>();
  private readonly allowedProviders: ReadonlySet<string>;

  constructor(allowedProviders: Provider[]) {
    this.allowedProviders = new Set(allowedProviders);
  }

  register(provider: Provider, adapter: IAdapter): void {
    this.registry.set(provider, adapter);
  }

  getAdapter(provider: string): IAdapter {
    if (!this.allowedProviders.has(provider)) {
      throw new AdapterRegistryError(
        `Provider "${provider}" is not in the allowed_providers list`,
        { provider, allowed: [...this.allowedProviders] },
      );
    }
    const adapter = this.registry.get(provider);
    if (!adapter) {
      throw new AdapterRegistryError(
        `Provider "${provider}" is allowed but has no registered adapter`,
        { provider },
      );
    }
    return adapter;
  }
}
