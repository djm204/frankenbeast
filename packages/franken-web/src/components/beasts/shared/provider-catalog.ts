import type { DashboardProvider } from '../../../lib/dashboard-api';
import type { ProviderOption } from './provider-model-select';

type ModelOption = { id: string; name: string };

/**
 * Known selectable models per *executing* CLI provider identity.
 *
 * The dashboard only ever reports a single, optional `model` per provider — the
 * operator-pinned override (see `config.providers.overrides[name].model` in
 * franken-orchestrator). Most configs never set that override and instead defer to
 * whatever model the provider itself resolves. Without a fallback, a configured/
 * available provider with no pinned override renders an empty Model dropdown,
 * blocking selection entirely (#3820).
 *
 * This mirrors the "gap handling" fallback described in
 * docs/adr/026-git-workflow-presets-and-per-action-llm-targeting.md, keyed by
 * `DashboardProvider.executionProvider` — the CLI identity the backend itself
 * already resolved this provider to (see `resolveWizardExecutionProvider` in
 * franken-orchestrator's providers/provider-config.ts, computed for every
 * snapshot entry by `buildDashboardProviderSnapshot` in cli/run.ts).
 *
 * Three prior revisions of this table tried to re-derive that same CLI
 * identity client-side from a provider's raw `type` and/or `name`, and each
 * one diverged from the backend's actual resolution in a different way
 * (#3888):
 *  - Keying by `type` alone offered a mismatched model whenever a provider's
 *    `type` didn't match what it actually executes as (e.g. an `openai-api`
 *    entry always launches the Codex CLI, never a direct OpenAI API call).
 *  - Keying by `name` alone (checking the wizard's own short-alias table)
 *    left a custom-named consolidated provider (e.g.
 *    `{ name: 'prod-claude', type: 'claude-cli' }`) with no fallback, since
 *    its name isn't a recognized alias.
 *  - Re-deriving name-first-then-type precedence client-side still diverged
 *    whenever a consolidated provider's name coincided with a recognized
 *    alias but its configured type disagreed (e.g.
 *    `{ name: 'claude', type: 'codex-cli' }` was offered a Claude model here,
 *    but franken-orchestrator's `resolveCliRegistryName` resolves it as
 *    Codex, because a matching `consolidatedProviders` entry's own `type`
 *    always wins over any name-based alias guess).
 *
 * Reading the already-resolved `executionProvider` the backend computed
 * eliminates this whole class of bug: the frontend never re-derives the CLI
 * identity from raw fields, so it cannot diverge from what actually executes.
 * Each entry here is the single model id franken-orchestrator itself already
 * treats as that CLI's default/flagship when no override is configured,
 * rather than an independently invented list — see the source comment on each
 * entry.
 *
 * `codex` is deliberately omitted: franken-orchestrator's CodexProvider
 * intentionally never hardcodes a default model (see
 * packages/franken-orchestrator/src/skills/providers/codex-provider.ts, #3412,
 * #3424) because `codex exec` resolves a newer account-level default than any
 * version string this codebase could pin, and a stale hardcode has broken runs
 * before. Surfacing guessed model ids here would let a wizard user pin the same
 * kind of stale value that policy exists to avoid, so Codex's Model dropdown stays
 * empty unless an operator explicitly configures an override.
 */
const KNOWN_MODELS_BY_CLI_PROVIDER: Record<string, readonly ModelOption[]> = {
  // franken-orchestrator/src/skills/providers/claude-provider.ts `chatModel`
  claude: [{ id: 'claude-opus-4-8', name: 'claude-opus-4-8' }],
  // franken-orchestrator/src/skills/providers/gemini-provider.ts `chatModel`
  gemini: [{ id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' }],
  // franken-orchestrator/src/skills/providers/aider-provider.ts `chatModel`
  aider: [{ id: 'sonnet', name: 'sonnet' }],
};

function modelsForProvider(provider: DashboardProvider): ModelOption[] {
  const cliProvider = provider.executionProvider;
  const known = (cliProvider && KNOWN_MODELS_BY_CLI_PROVIDER[cliProvider]) || [];
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
