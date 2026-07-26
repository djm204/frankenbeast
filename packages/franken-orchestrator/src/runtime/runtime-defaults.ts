import { CodexRuntimeAdapter, type CodexRuntimeAdapterOptions } from './codex/codex-runtime-adapter.js';
import { HermesRuntimeAdapter, type HermesRuntimeAdapterOptions } from './hermes/hermes-runtime-adapter.js';
import { RuntimeAdapterRegistry } from './runtime-adapter-registry.js';

export interface DefaultRuntimeAdapterOptions extends HermesRuntimeAdapterOptions {
  codex?: CodexRuntimeAdapterOptions | undefined;
}

export function createDefaultRuntimeAdapterRegistry(
  options: DefaultRuntimeAdapterOptions = {},
): RuntimeAdapterRegistry {
  const codexOptions: CodexRuntimeAdapterOptions = {
    ...options.codex,
    env: options.codex?.env ?? options.env,
  };
  return new RuntimeAdapterRegistry([
    new HermesRuntimeAdapter(options),
    new CodexRuntimeAdapter(codexOptions),
  ]);
}
