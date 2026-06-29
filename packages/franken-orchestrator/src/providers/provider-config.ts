import type { ILlmProvider } from '@franken/types';
import { ClaudeCliAdapter } from './claude-cli-adapter.js';
import { CodexCliAdapter } from './codex-cli-adapter.js';
import { GeminiCliAdapter } from './gemini-cli-adapter.js';
import { AnthropicApiAdapter } from './anthropic-api-adapter.js';
import { OpenAiApiAdapter } from './openai-api-adapter.js';
import { GeminiApiAdapter } from './gemini-api-adapter.js';

export const PROVIDER_TYPES = [
  'claude-cli',
  'codex-cli',
  'gemini-cli',
  'anthropic-api',
  'openai-api',
  'gemini-api',
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface ProviderOverrideConfig {
  readonly command?: string | undefined;
  readonly model?: string | undefined;
  readonly extraArgs?: readonly string[] | undefined;
}

export interface ProviderConfig {
  readonly name: string;
  readonly type: ProviderType;
  readonly apiKey?: string | undefined;
  readonly cliPath?: string | undefined;
  readonly model?: string | undefined;
  readonly extraArgs?: readonly string[] | undefined;
}

export interface ProviderCatalogEntry {
  readonly name: string;
  readonly type: ProviderType;
  readonly cliRegistryName?: string | undefined;
  readonly defaultCommand?: string | undefined;
  readonly supportsCliRegistry: boolean;
}

const CATALOG: readonly ProviderCatalogEntry[] = [
  {
    name: 'claude',
    type: 'claude-cli',
    cliRegistryName: 'claude',
    defaultCommand: 'claude',
    supportsCliRegistry: true,
  },
  {
    name: 'codex',
    type: 'codex-cli',
    cliRegistryName: 'codex',
    defaultCommand: 'codex',
    supportsCliRegistry: true,
  },
  {
    name: 'gemini',
    type: 'gemini-cli',
    cliRegistryName: 'gemini',
    defaultCommand: 'gemini',
    supportsCliRegistry: true,
  },
  {
    name: 'anthropic',
    type: 'anthropic-api',
    supportsCliRegistry: false,
  },
  {
    name: 'openai',
    type: 'openai-api',
    supportsCliRegistry: false,
  },
  {
    name: 'gemini-api',
    type: 'gemini-api',
    supportsCliRegistry: false,
  },
] as const;

const TYPE_TO_ENTRY = new Map(CATALOG.map((entry) => [entry.type, entry]));
const NAME_OR_TYPE_TO_ENTRY = new Map<string, ProviderCatalogEntry>();
for (const entry of CATALOG) {
  NAME_OR_TYPE_TO_ENTRY.set(entry.name, entry);
  NAME_OR_TYPE_TO_ENTRY.set(entry.type, entry);
  if (entry.cliRegistryName) {
    NAME_OR_TYPE_TO_ENTRY.set(entry.cliRegistryName, entry);
  }
}

export function providerCatalogEntries(): readonly ProviderCatalogEntry[] {
  return CATALOG;
}

export function cliProviderCatalogEntries(): readonly ProviderCatalogEntry[] {
  return CATALOG.filter((entry) => entry.supportsCliRegistry);
}

export function resolveProviderCatalogEntry(nameOrType: string): ProviderCatalogEntry {
  const entry = NAME_OR_TYPE_TO_ENTRY.get(nameOrType);
  if (entry) return entry;

  const known = [...NAME_OR_TYPE_TO_ENTRY.keys()].sort().join(', ');
  throw new Error(
    `Unknown provider "${nameOrType}". Configure a typed consolidated provider or use one of: ${known}`,
  );
}

export function resolveProviderType(nameOrType: string, explicitType?: ProviderType): ProviderType {
  if (explicitType) {
    if (!TYPE_TO_ENTRY.has(explicitType)) {
      throw new Error(`Unknown provider type: ${explicitType}`);
    }
    return explicitType;
  }
  return resolveProviderCatalogEntry(nameOrType).type;
}

export function buildProviderConfig(
  name: string,
  override?: ProviderOverrideConfig,
): ProviderConfig {
  const entry = resolveProviderCatalogEntry(name);
  return {
    name,
    type: entry.type,
    ...(override?.command ? { cliPath: override.command } : {}),
    ...(override?.model ? { model: override.model } : {}),
    ...(override?.extraArgs ? { extraArgs: override.extraArgs } : {}),
  };
}

export function createLlmProvider(config: ProviderConfig): ILlmProvider {
  const type = resolveProviderType(config.name, config.type);
  switch (type) {
    case 'claude-cli':
      return new ClaudeCliAdapter({
        ...(config.cliPath ? { binaryPath: config.cliPath } : {}),
        ...(config.extraArgs ? { extraArgs: config.extraArgs } : {}),
      });
    case 'codex-cli':
      return new CodexCliAdapter({
        ...(config.cliPath ? { binaryPath: config.cliPath } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(config.extraArgs ? { extraArgs: config.extraArgs } : {}),
      });
    case 'gemini-cli':
      return new GeminiCliAdapter({
        ...(config.cliPath ? { binaryPath: config.cliPath } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(config.extraArgs ? { extraArgs: config.extraArgs } : {}),
      });
    case 'anthropic-api':
      return new AnthropicApiAdapter({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.model ? { model: config.model } : {}),
      });
    case 'openai-api':
      return new OpenAiApiAdapter({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.model ? { model: config.model } : {}),
      });
    case 'gemini-api':
      return new GeminiApiAdapter({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.model ? { model: config.model } : {}),
      });
  }
}
