import { HermesRuntimeAdapter, type HermesRuntimeAdapterOptions } from './hermes/hermes-runtime-adapter.js';
import { RuntimeAdapterRegistry } from './runtime-adapter-registry.js';

export function createDefaultRuntimeAdapterRegistry(
  options: HermesRuntimeAdapterOptions = {},
): RuntimeAdapterRegistry {
  return new RuntimeAdapterRegistry([new HermesRuntimeAdapter(options)]);
}