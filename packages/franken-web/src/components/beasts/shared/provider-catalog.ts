import type { DashboardProvider } from '../../../lib/dashboard-api';
import type { ProviderOption } from './provider-model-select';

type ModelOption = { id: string; name: string };

/**
 * Known selectable models per configured provider type.
 *
 * The dashboard only ever reports a single, optional `model` per provider — the
 * operator-pinned override (see `config.providers.overrides[name].model` in
 * franken-orchestrator). Most configs, especially CLI-based providers like `codex-cli`
 * and `claude-cli`, never set that override and instead defer to whatever model the
 * CLI itself resolves. Without a fallback, a configured/available provider with no
 * pinned override renders an empty Model dropdown, blocking selection entirely (#3820).
 *
 * This mirrors the "gap handling" fallback described in
 * docs/adr/026-git-workflow-presets-and-per-action-llm-targeting.md and the model IDs
 * already used by @franken/observer's default pricing table, scoped per provider type
 * so a provider only ever offers models it can actually run (unlike the earlier,
 * provider-agnostic fallback list removed for #1174).
 */
const KNOWN_MODELS_BY_TYPE: Record<string, readonly ModelOption[]> = {
  'claude-cli': [
    { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
    { id: 'claude-opus-4-6', name: 'claude-opus-4-6' },
    { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
  ],
  'anthropic-api': [
    { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
    { id: 'claude-opus-4-6', name: 'claude-opus-4-6' },
    { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
  ],
  'codex-cli': [
    { id: 'gpt-4o', name: 'gpt-4o' },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
  ],
  'openai-api': [
    { id: 'gpt-4o', name: 'gpt-4o' },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
  ],
  'gemini-cli': [
    { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash' },
  ],
  'gemini-api': [
    { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash' },
  ],
};

function modelsForProvider(provider: DashboardProvider): ModelOption[] {
  const known = KNOWN_MODELS_BY_TYPE[provider.type] ?? [];
  if (!provider.model) return [...known];
  if (known.some((model) => model.id === provider.model)) return [...known];
  return [{ id: provider.model, name: provider.model }, ...known];
}

export function dashboardProvidersToModelOptions(providers: readonly DashboardProvider[]): ProviderOption[] {
  return [...providers]
    .filter((provider) => provider.type === 'llm' || provider.type.endsWith('-api') || provider.type.endsWith('-cli'))
    .sort((a, b) => a.failoverOrder - b.failoverOrder)
    .map((provider) => ({
      id: provider.name,
      name: provider.name,
      models: modelsForProvider(provider),
    }));
}
