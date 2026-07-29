import type { DashboardProvider } from '../../../lib/dashboard-api';
import type { ProviderOption } from './provider-model-select';
import { normalizeWizardProvider } from '../wizard-launch-config';

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
 * docs/adr/026-git-workflow-presets-and-per-action-llm-targeting.md. Earlier
 * revisions of this fallback keyed models by the dashboard-reported `type` field
 * (e.g. `openai-api`, `claude-cli`) and got that wrong twice more (#3888):
 *
 *  - `buildWizardLaunchConfig` normalizes *every* selected provider down to one of
 *    four CLI identities that actually execute the Beast Loop — `claude`, `codex`,
 *    `gemini`, or `aider` (see `normalizeWizardProvider` /
 *    `CLI_PROVIDER_BY_WIZARD_PROVIDER` in wizard-launch-config.ts). An `openai-api`
 *    or `anthropic-api` dashboard entry is never actually called as a direct API;
 *    it launches the Codex/Claude CLI respectively. Offering that entry's own
 *    API-adapter default model (e.g. `gpt-4o`) pinned that value onto the wrong
 *    CLI's `--model` flag.
 *  - Legacy `aider` providers are reported with `type: 'claude-cli'` for lookup
 *    purposes (see `resolveDashboardProviderType` in franken-orchestrator's
 *    cli/run.ts) even though `AiderProvider` is a distinct CLI with its own
 *    default model, so a type-keyed lookup silently pinned a Claude model id onto
 *    `aider --model`.
 *
 * To avoid a further instance of the same class of bug, this table is keyed by
 * the same resolved CLI identity `buildWizardLaunchConfig` will actually invoke
 * (via the shared `normalizeWizardProvider` helper) rather than by the dashboard's
 * raw `type`/`name` fields, so a provider can only ever be offered a model its
 * real executing CLI understands. Each entry is the single model id
 * franken-orchestrator itself already treats as that CLI's default/flagship when
 * no override is configured, rather than an independently invented list — see the
 * source comment on each entry.
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
  const cliProvider = normalizeWizardProvider(provider.name);
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
