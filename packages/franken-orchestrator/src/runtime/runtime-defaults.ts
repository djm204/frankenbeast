import { HermesRuntimeAdapter, type HermesRuntimeAdapterOptions } from './hermes/hermes-runtime-adapter.js';
import { OllamaRuntimeAdapter, type OllamaRuntimeAdapterOptions } from './ollama/ollama-runtime-adapter.js';
import { RuntimeAdapterRegistry } from './runtime-adapter-registry.js';

export interface RuntimeAdapterDefaultsOptions extends HermesRuntimeAdapterOptions, OllamaRuntimeAdapterOptions {}

export function createDefaultRuntimeAdapterRegistry(
  options: RuntimeAdapterDefaultsOptions = {},
): RuntimeAdapterRegistry {
  return new RuntimeAdapterRegistry([
    new HermesRuntimeAdapter(options),
    new OllamaRuntimeAdapter(options),
  ]);
}
