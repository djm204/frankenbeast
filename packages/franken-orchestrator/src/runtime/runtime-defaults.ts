import { CodexRuntimeAdapter, type CodexRuntimeAdapterOptions } from './codex/codex-runtime-adapter.js';
import { HermesRuntimeAdapter, type HermesRuntimeAdapterOptions } from './hermes/hermes-runtime-adapter.js';
import { OllamaRuntimeAdapter, type OllamaRuntimeAdapterOptions } from './ollama/ollama-runtime-adapter.js';
import { RuntimeAdapterRegistry } from './runtime-adapter-registry.js';
import { filterSecretEnvVars } from '../security/env-filter.js';

export interface RuntimeAdapterDefaultsOptions extends HermesRuntimeAdapterOptions, OllamaRuntimeAdapterOptions {
  codex?: CodexRuntimeAdapterOptions | undefined;
}

export type DefaultRuntimeAdapterOptions = RuntimeAdapterDefaultsOptions;

export function createDefaultRuntimeAdapterRegistry(
  options: RuntimeAdapterDefaultsOptions = {},
): RuntimeAdapterRegistry {
  const codexOptions: CodexRuntimeAdapterOptions = {
    ...options.codex,
    // Merging the caller's partial override on top of the complete
    // process.env (so an override like { PATH } doesn't drop everything
    // else the CLI needs) re-introduces the exact ambient-secret-forwarding
    // problem this filter exists to prevent — filter the merged result the
    // same way codex-app-server-client.ts's own default path does, rather
    // than assuming a caller-supplied env is automatically safe.
    env: options.codex?.env ?? (options.env === undefined
      ? undefined
      : filterSecretEnvVars({ ...process.env, ...options.env } as Record<string, string>, ['OPENAI_API_KEY'])),
  };
  return new RuntimeAdapterRegistry([
    new HermesRuntimeAdapter(options),
    new OllamaRuntimeAdapter(options),
    new CodexRuntimeAdapter(codexOptions),
  ]);
}
