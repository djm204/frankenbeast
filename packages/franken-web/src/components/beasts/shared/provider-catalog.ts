import type { DashboardProvider } from '../../../lib/dashboard-api';
import type { ProviderOption } from './provider-model-select';

type ModelOption = { id: string; name: string };

/**
 * Known selectable models per configured provider type.
 *
 * The dashboard only ever reports a single, optional `model` per provider — the
 * operator-pinned override (see `config.providers.overrides[name].model` in
 * franken-orchestrator). Most configs never set that override and instead defer to
 * whatever model the provider itself resolves. Without a fallback, a configured/
 * available provider with no pinned override renders an empty Model dropdown,
 * blocking selection entirely (#3820).
 *
 * This mirrors the "gap handling" fallback described in
 * docs/adr/026-git-workflow-presets-and-per-action-llm-targeting.md, scoped per
 * provider type so a provider only ever offers models it can actually run (unlike
 * the earlier, provider-agnostic fallback list removed for #1174). Each entry is the
 * single model id that franken-orchestrator itself already treats as that provider's
 * default/flagship when no override is configured, rather than an independently
 * invented list — see the source comment on each entry.
 *
 * `codex-cli` is deliberately omitted: franken-orchestrator's CodexProvider
 * intentionally never hardcodes a default model (see
 * packages/franken-orchestrator/src/skills/providers/codex-provider.ts, #3412,
 * #3424) because `codex exec` resolves a newer account-level default than any
 * version string this codebase could pin, and a stale hardcode has broken runs
 * before. Surfacing guessed model ids here would let a wizard user pin the same
 * kind of stale value that policy exists to avoid, so Codex's Model dropdown stays
 * empty unless an operator explicitly configures an override.
 */
const KNOWN_MODELS_BY_TYPE: Record<string, readonly ModelOption[]> = {
  // franken-orchestrator/src/skills/providers/claude-provider.ts `chatModel`
  'claude-cli': [{ id: 'claude-opus-4-8', name: 'claude-opus-4-8' }],
  // franken-orchestrator/src/providers/anthropic-api-adapter.ts default `model`
  'anthropic-api': [{ id: 'claude-sonnet-4-20250514', name: 'claude-sonnet-4-20250514' }],
  // franken-orchestrator/src/providers/openai-api-adapter.ts default `model`
  'openai-api': [{ id: 'gpt-4o', name: 'gpt-4o' }],
  // franken-orchestrator/src/skills/providers/gemini-provider.ts `chatModel`
  'gemini-cli': [{ id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' }],
  // franken-orchestrator/src/providers/gemini-api-adapter.ts default `model`
  'gemini-api': [{ id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' }],
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
