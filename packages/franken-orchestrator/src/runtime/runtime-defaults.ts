import { CodexRuntimeAdapter, type CodexRuntimeAdapterOptions } from './codex/codex-runtime-adapter.js';
import { HermesRuntimeAdapter, type HermesRuntimeAdapterOptions } from './hermes/hermes-runtime-adapter.js';
import { OllamaRuntimeAdapter, type OllamaRuntimeAdapterOptions } from './ollama/ollama-runtime-adapter.js';
import { RuntimeAdapterRegistry } from './runtime-adapter-registry.js';

export interface RuntimeAdapterDefaultsOptions extends HermesRuntimeAdapterOptions, OllamaRuntimeAdapterOptions {
  codex?: CodexRuntimeAdapterOptions | undefined;
}

export type DefaultRuntimeAdapterOptions = RuntimeAdapterDefaultsOptions;

export function createDefaultRuntimeAdapterRegistry(
  options: RuntimeAdapterDefaultsOptions = {},
): RuntimeAdapterRegistry {
  const codexOptions: CodexRuntimeAdapterOptions = {
    ...options.codex,
    env: options.codex?.env ?? (options.env === undefined
      ? undefined
      : { ...process.env, ...options.env }),
  };
  return new RuntimeAdapterRegistry([
    new HermesRuntimeAdapter(options),
    new OllamaRuntimeAdapter(options),
    new CodexRuntimeAdapter(codexOptions),
  ]);
}
