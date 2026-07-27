import type { RuntimeAdapter } from './runtime-adapter.js';
import { RuntimeProviderSchema, type RuntimeProvider } from './runtime-schemas.js';

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();

  constructor(adapters: readonly RuntimeAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: RuntimeAdapter): void {
    RuntimeProviderSchema.shape.id.parse(adapter.id);
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Runtime adapter '${adapter.id}' is already registered`);
    }
    if (typeof adapter.validateEventCursor !== 'function') {
      throw new Error(`Runtime adapter '${adapter.id}' must implement validateEventCursor`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): RuntimeAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Runtime adapter '${id}' is not registered`);
    return adapter;
  }

  async list(): Promise<RuntimeProvider[]> {
    return await Promise.all(
      [...this.adapters.values()].map(async (adapter) => {
        const provider = RuntimeProviderSchema.parse(await adapter.describe());
        if (provider.id !== adapter.id) {
          throw new Error(`Runtime adapter described id '${provider.id}' does not match registered id '${adapter.id}'`);
        }
        return provider;
      }),
    );
  }
}
