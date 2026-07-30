import type { ILlmProvider } from '@franken/types';
import { ClaudeCliAdapter } from './claude-cli-adapter.js';
import { CodexCliAdapter } from './codex-cli-adapter.js';
import { GeminiCliAdapter } from './gemini-cli-adapter.js';
import { AnthropicApiAdapter } from './anthropic-api-adapter.js';
import { OpenAiApiAdapter } from './openai-api-adapter.js';
import { GeminiApiAdapter } from './gemini-api-adapter.js';
import type { EgressAuditSink, EgressPolicyConfig } from '../network/egress-policy.js';

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
  readonly trustCommandOverride?: boolean | undefined;
  readonly trustedCommandPaths?: readonly string[] | undefined;
  readonly model?: string | undefined;
  readonly extraArgs?: readonly string[] | undefined;
}

export interface ProviderConfig {
  readonly name: string;
  readonly type: ProviderType;
  readonly apiKey?: string | undefined;
  readonly cliPath?: string | undefined;
  readonly trustCommandOverride?: boolean | undefined;
  readonly trustedCommandPaths?: readonly string[] | undefined;
  readonly model?: string | undefined;
  readonly extraArgs?: readonly string[] | undefined;
}

export interface ProviderRuntimeOptions {
  readonly egressPolicy?: EgressPolicyConfig | undefined;
  readonly egressAudit?: EgressAuditSink | undefined;
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

/**
 * Short provider names/types the Beast Wizard treats as shorthand for one of
 * the four CLI providers that actually execute the Beast Loop
 * (claude/codex/gemini/aider). Mirrors packages/franken-web/src/components/
 * beasts/wizard-launch-config.ts's CLI_PROVIDER_BY_WIZARD_PROVIDER, which
 * applies this exact mapping to whatever provider name an operator selects,
 * client-side, before it is ever submitted to the orchestrator. Kept as a
 * distinct, wizard-scoped table (not folded into resolveCliRegistryName in
 * cli/dep-factory.ts) because CLI-driven runs (config `providers.default` /
 * `fallbackChain` entries, not routed through the web wizard) must not gain
 * this aliasing — see resolveWizardExecutionProvider below.
 */
const WIZARD_PROVIDER_ALIASES: Record<string, string> = {
  anthropic: 'claude',
  'anthropic-api': 'claude',
  'claude-cli': 'claude',
  openai: 'codex',
  'openai-api': 'codex',
  'codex-cli': 'codex',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  'gemini-cli': 'gemini',
  aider: 'aider',
  claude: 'claude',
  codex: 'codex',
};

export interface ConsolidatedProviderLookup {
  readonly name: string;
  readonly type: string;
}

/**
 * Resolve the CLI registry name (claude/codex/gemini/aider) that selecting a
 * given provider in the Beast Wizard will actually execute as, given the
 * operator's configured consolidated providers (if any).
 *
 * This mirrors the exact two-stage pipeline a real Beast Wizard launch goes
 * through end to end, so the wizard's Model dropdown can never predict a
 * different CLI than the one that actually runs (#3820, #3888):
 *
 *  1. The wizard normalizes the selected provider's *name* through
 *     WIZARD_PROVIDER_ALIASES before submission — this happens purely from
 *     the string value of the name, with no knowledge of the provider's
 *     configured `type`.
 *  2. `resolveCliRegistryName` (cli/dep-factory.ts) then looks up a matching
 *     `consolidatedProviders` entry by name-or-type and, when found, resolves
 *     via *that entry's own type* — which can differ from what stage 1
 *     assumed when an operator names a consolidated provider after one of the
 *     short aliases but configures it with a different type (e.g.
 *     `{ name: 'claude', type: 'codex-cli' }` actually executes Codex, not
 *     Claude, because the consolidated lookup's type wins).
 *
 * This is intentionally a separate function from `resolveCliRegistryName`
 * rather than a modification of it: `resolveCliRegistryName` is also used for
 * CLI-driven runs that never go through the web wizard (config
 * `providers.default` / `fallbackChain` entries), which must not gain the
 * wizard-only short-alias behavior.
 */
export function resolveWizardExecutionProvider(
  providerName: string,
  consolidatedProviders: readonly ConsolidatedProviderLookup[] = [],
): string | undefined {
  // Mirror normalizeWizardProvider's own trimming exactly: the wizard trims the
  // selected provider name before submission, so a consolidated provider name
  // with surrounding whitespace (which ProviderConfigSchema currently accepts)
  // would otherwise resolve differently here than what actually launches — see
  // #3888, where `{ name: ' codex ', type: 'claude-cli' }` was reported as
  // executing Claude, but the trimmed 'codex' submitted at launch no longer
  // matches this entry and resolves to the plain Codex CLI default instead.
  const trimmedProviderName = providerName.trim();
  if (trimmedProviderName.length === 0) return undefined;
  const submittedName = WIZARD_PROVIDER_ALIASES[trimmedProviderName] ?? trimmedProviderName;
  if (submittedName === 'aider') return 'aider';
  const configuredProvider = consolidatedProviders.find(
    (provider) => provider.name === submittedName || provider.type === submittedName,
  );
  const catalogName = configuredProvider?.type ?? submittedName;
  try {
    return resolveProviderCatalogEntry(catalogName).cliRegistryName;
  } catch {
    return undefined;
  }
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

export function createLlmProvider(config: ProviderConfig, runtimeOptions: ProviderRuntimeOptions = {}): ILlmProvider {
  const type = resolveProviderType(config.name, config.type);
  switch (type) {
    case 'claude-cli':
      return new ClaudeCliAdapter({
        ...(config.cliPath ? { binaryPath: config.cliPath } : {}),
        ...(config.model ? { model: config.model } : {}),
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
        ...(runtimeOptions.egressPolicy ? { egressPolicy: runtimeOptions.egressPolicy } : {}),
        ...(runtimeOptions.egressAudit ? { egressAudit: runtimeOptions.egressAudit } : {}),
      });
    case 'openai-api':
      return new OpenAiApiAdapter({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(runtimeOptions.egressPolicy ? { egressPolicy: runtimeOptions.egressPolicy } : {}),
        ...(runtimeOptions.egressAudit ? { egressAudit: runtimeOptions.egressAudit } : {}),
      });
    case 'gemini-api':
      return new GeminiApiAdapter({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(runtimeOptions.egressPolicy ? { egressPolicy: runtimeOptions.egressPolicy } : {}),
        ...(runtimeOptions.egressAudit ? { egressAudit: runtimeOptions.egressAudit } : {}),
      });
  }
}
