# Dashboard Agent Configuration — Implementation Plan

**Date:** 2026-03-09
**Status:** Proposed
**Scope:** Cross-module
**Depends On:** [2026-03-08 Dashboard Implementation Plan](./2026-03-08-dashboard-implementation-plan.md)

## Goal

Add agent configuration management to the Frankenbeast dashboard so operators can define, edit, validate, and persist the settings that currently live in CLI arguments and config files.

This should let an operator manage:

- per-LLM model configuration
- per-LLM plugin configuration
- budget and token guardrails
- context-window limits
- provider fallback order
- general orchestrator settings currently passed through CLI/config

The dashboard must become the operator-facing control plane for durable agent settings, while the CLI remains a valid execution surface.

---

## Dependency and Gating

This plan is intentionally downstream of the dashboard plan.

Do not start this work until the dashboard foundation is complete enough to support:

- authenticated dashboard API routes
- persistent dashboard-backed storage
- dashboard UI navigation and settings screens
- shared API validation patterns
- the dashboard package and backend wiring defined in the dashboard plan

Minimum recommended gate:

- dashboard plan Phases 1 through 5 complete

Preferred gate:

- dashboard plan exit criteria complete, then this plan lands as the next operator-control milestone

Reason:

- agent configuration is not just another page
- it introduces write paths, persistence, validation, provider capability discovery, and config-to-runtime translation
- doing it before the dashboard shell is stable will create duplicate API and state-management work

---

## Problem Statement

Today, Frankenbeast configuration is split across:

- CLI flags such as `--provider`, `--providers`, `--budget`, `--verbose`, and `--no-pr`
- JSON config via `--config`
- environment variables like `FRANKEN_MAX_TOTAL_TOKENS`
- provider-specific overrides such as model and extra args

This is workable for power users, but it is not a good operator experience.

The dashboard should expose a coherent configuration model instead of forcing operators to remember:

- which settings are file-based versus flag-based
- which settings are global versus provider-specific
- which providers support plugins or special install flows
- how to translate UI choices into CLI invocation shape

---

## Scope

### In scope

- persisted agent profiles in the dashboard
- per-provider model settings
- per-provider plugin settings with marketplace passthrough where supported
- budget and token controls
- max context-window settings
- general orchestrator settings that are durable and operator-managed
- translation from dashboard profile -> orchestrator config + launch args
- validation and capability checks before save/apply
- auditability for configuration changes

### Out of scope

- replacing the CLI as an execution surface
- mirroring transient workflow flags into saved agent profiles
- designing or building a full plugin marketplace itself
- arbitrary provider plugin execution without an explicit capability contract
- user-facing end-customer preference management

---

## Key Design Decision

### Distinguish durable agent configuration from transient run flags

Not every CLI flag belongs in the dashboard as saved agent configuration.

Saved dashboard-managed configuration should include durable operator intent, such as:

- default provider
- fallback chain
- per-provider model
- per-provider plugin selection
- max token budget
- context window limit
- tracing and heartbeat defaults
- critique thresholds
- PR behavior defaults

Do not store transient workflow inputs as part of the agent profile, such as:

- `--design-doc`
- `--plan-dir`
- `--cleanup`
- `--reset`
- `--resume`
- `issues` search flags

If the dashboard later supports launching a run, those should be launch-time overrides, not saved profile state.

---

## Configuration Surface To Abstract

The dashboard configuration model should absorb the current durable Frankenbeast config surface from:

- `providers.default`
- `providers.fallbackChain`
- `providers.overrides[provider].command`
- `providers.overrides[provider].model`
- `providers.overrides[provider].extraArgs`
- `maxCritiqueIterations`
- `maxTotalTokens`
- `maxDurationMs`
- `enableHeartbeat`
- `enableTracing`
- `minCritiqueScore`
- default budget in USD
- default `noPr` behavior

Additional dashboard-only normalized fields should be added where the current CLI/config surface is too low-level:

- `maxContextWindowTokens`
- `pluginSelections`
- `pluginInstallMode`
- `pluginConfig`
- `profileName`
- `profileDescription`
- `isDefaultProfile`

---

## Per-Provider Configuration Model

Agent config must be provider-specific. Each provider has different knobs, defaults, and plugin semantics.

Example normalized shape:

```ts
type AgentProfile = {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  budgetUsd: number;
  maxContextWindowTokens?: number;
  maxTotalTokens: number;
  maxDurationMs: number;
  maxCritiqueIterations: number;
  minCritiqueScore: number;
  enableTracing: boolean;
  enableHeartbeat: boolean;
  noPr: boolean;
  defaultProvider: string;
  fallbackChain: string[];
  providers: Record<string, ProviderProfile>;
};

type ProviderProfile = {
  enabled: boolean;
  model?: string;
  commandOverride?: string;
  extraArgs?: string[];
  maxContextWindowTokens?: number;
  plugins: ProviderPluginSelection[];
};

type ProviderPluginSelection = {
  pluginId: string;
  source: 'marketplace' | 'manual';
  installMode: 'passthrough' | 'dashboard-managed' | 'none';
  config?: Record<string, unknown>;
};
```

This normalized profile should be canonical in the dashboard.

The dashboard must then translate it into the narrower runtime config actually accepted by Frankenbeast today.

---

## Plugin Configuration Requirements

Plugin configuration should be modeled as a provider capability, not as a single global concept.

Requirements:

- plugin settings are different per LLM/provider
- plugin support is optional, not assumed
- dashboard should surface only the plugin controls supported by the selected provider
- if a provider supports marketplace installation, the dashboard should pass through the install request rather than reimplementing marketplace semantics
- if a provider does not support plugins, the dashboard should say that explicitly and disable the section

Examples:

- Claude-style provider may expose plugin directory or marketplace install passthrough if available
- Codex may have a different extension/tooling surface
- Gemini may support none, or a different install/config model
- Aider may have separate flags and no marketplace flow at all

This implies a required capability registry:

```ts
type ProviderCapabilities = {
  provider: string;
  supportsPlugins: boolean;
  supportsMarketplaceInstall: boolean;
  supportsModelSelection: boolean;
  supportsContextWindowOverride: boolean;
  supportedPluginConfigSchema?: JsonSchema;
};
```

Without this registry, the dashboard will either over-promise or hardcode provider logic into the UI.

---

## Recommended Ownership

### Canonical schema lives in `franken-orchestrator`

Do not let the dashboard invent a shadow config language.

The canonical persisted schema and translation logic should live with the runtime that consumes it:

```text
packages/franken-orchestrator/src/
  config/
    agent-profile-schema.ts
    agent-profile-store.ts
    config-translation.ts
    provider-capabilities.ts
    plugin-capabilities.ts
```

### Dashboard API consumes orchestrator-owned schema

The dashboard backend should expose CRUD and install/apply routes:

```text
packages/franken-observer/src/dashboard/
  agent-config-api.ts
  agent-config-routes.ts
```

### Dashboard UI remains operator-focused

```text
franken-dashboard/src/
  pages/
    agent-config.tsx
    agent-config-detail.tsx
  components/
    provider-config-card.tsx
    plugin-config-panel.tsx
    model-config-form.tsx
    guardrail-settings-form.tsx
    config-diff-preview.tsx
```

---

## API Surface

Recommended endpoints:

- `GET /api/dashboard/agent-profiles`
- `POST /api/dashboard/agent-profiles`
- `GET /api/dashboard/agent-profiles/:id`
- `PUT /api/dashboard/agent-profiles/:id`
- `DELETE /api/dashboard/agent-profiles/:id`
- `GET /api/dashboard/agent-profiles/:id/runtime-preview`
- `GET /api/dashboard/providers/capabilities`
- `POST /api/dashboard/agent-profiles/:id/providers/:provider/install-plugin`
- `POST /api/dashboard/agent-profiles/:id/validate`
- `POST /api/dashboard/agent-profiles/:id/apply`

Behavior expectations:

- validation should fail fast on unsupported provider/plugin combinations
- runtime preview should show the translated Frankenbeast config and launch args
- apply should persist the profile and optionally write/update `.frankenbeast/config.json`
- install-plugin should delegate to the provider-specific marketplace/install adapter where supported

---

## UI Requirements

The dashboard should expose agent configuration as a dedicated operator settings area, not as a miscellaneous modal.

Recommended page structure:

## 1. Profiles List

- list saved agent profiles
- show default profile
- show default provider, fallback chain, budget, and last modified time
- duplicate and clone support

## 2. Profile Editor

- general settings section
- provider routing section
- per-provider cards or tabs
- plugin configuration per provider
- guardrail settings
- save, validate, and apply actions

## 3. Runtime Preview

- show translated JSON config
- show derived CLI args or launch payload
- show unsupported settings dropped during translation

## 4. Audit History

- who changed the profile
- when
- diff summary

The UX should make provider differences obvious. Do not flatten all providers into one generic form.

---

## Translation Rules

The dashboard profile model will be richer than the current runtime config.

That means translation must be explicit:

### Profile -> current Frankenbeast runtime

Translate into:

- `OrchestratorConfig`
- primary provider
- fallback chain
- session defaults such as budget and `noPr`

### Unsupported fields

If the dashboard stores a field that current Frankenbeast cannot yet honor:

- do not silently pretend it works
- mark it as `stored but not yet enforced`
- show this in runtime preview and validation output

This is especially important for:

- `maxContextWindowTokens`
- plugin install selections for providers that do not yet expose runtime hooks
- any marketplace-specific plugin config not yet consumed by provider implementations

---

## Persistence Strategy

Use dashboard-managed durable storage first, with optional projection to local file config.

Recommended v1:

- persist agent profiles in SQLite beside dashboard analytics storage
- add an explicit projection/export step to `.frankenbeast/config.json`
- keep file output deterministic and reproducible

Why:

- dashboard needs multi-profile support and metadata like display name, audit history, and timestamps
- `.frankenbeast/config.json` is too narrow to act as the full source of truth by itself

---

## Security and Governance

This feature introduces write paths into runtime behavior. Treat it as operator control, not convenience UI.

Requirements:

- auth required for all write endpoints
- role-based permission for create/update/apply/install actions
- audit log for every profile change
- audit log for plugin install attempts
- validation before apply
- safe redaction for secrets or provider auth material

Do not persist provider API keys or marketplace credentials in profile payloads.

Store references or secret handles instead.

---

## Integration Plan

## Phase 0: Readiness Gate

Deliverables:

- dashboard base plan marked complete enough for config write paths
- package placement finalized
- auth story agreed for operator writes

Tests:

- none beyond dependency confirmation

## Phase 1: Canonical Config Domain

Deliverables:

- `AgentProfile` schema
- provider capability schema
- plugin capability schema
- translation contract to current orchestrator config

Tests:

- schema validation
- round-trip serialization
- profile -> runtime preview correctness

## Phase 2: Provider Capability Registry

Deliverables:

- capability descriptors for `claude`, `codex`, `gemini`, `aider`
- model support flags
- plugin support flags
- marketplace passthrough support flags

Tests:

- dashboard only exposes supported controls
- unsupported provider/plugin combinations fail validation

## Phase 3: Storage and Audit

Deliverables:

- SQLite tables for profiles, provider configs, plugin selections, audit history
- CRUD service layer
- config diff generation

Tests:

- create/update/delete profile flows
- audit history correctness
- default profile uniqueness

## Phase 4: Dashboard API

Deliverables:

- CRUD routes
- validate route
- runtime preview route
- install-plugin passthrough route
- apply route

Tests:

- auth enforcement
- validation failures are structured
- runtime preview matches translation layer
- install route dispatches only for supported providers

## Phase 5: Dashboard UI

Deliverables:

- profiles list page
- profile editor
- per-provider plugin/model settings
- runtime preview panel
- audit history view

Tests:

- provider-specific forms change based on capability registry
- validation errors map to fields cleanly
- saved profile rehydrates without loss
- preview updates as config changes

## Phase 6: Runtime Apply and File Projection

Deliverables:

- write projected config to `.frankenbeast/config.json`
- support apply-to-runtime for dashboard-launched runs
- diff preview before overwrite

Tests:

- projected file matches expected runtime config
- apply does not write transient launch-only flags into saved config
- fallback chain and provider overrides remain stable

## Phase 7: Hardening

Deliverables:

- optimistic locking or revision checks
- secret-handle integration
- rollback or revert to previous profile revision
- clearer unsupported-setting messaging

Tests:

- concurrent edits fail safely
- revision history restore works
- secrets never leak in API responses or audit payloads

---

## Data Model Sketch

Recommended tables:

### `agent_profiles`

- `profile_id`
- `name`
- `description`
- `is_default`
- `budget_usd`
- `max_context_window_tokens`
- `max_total_tokens`
- `max_duration_ms`
- `max_critique_iterations`
- `min_critique_score`
- `enable_tracing`
- `enable_heartbeat`
- `no_pr`
- `default_provider`
- `fallback_chain_json`
- `created_at`
- `updated_at`

### `agent_profile_providers`

- `profile_id`
- `provider`
- `enabled`
- `model`
- `command_override`
- `extra_args_json`
- `max_context_window_tokens`
- `config_json`

### `agent_profile_plugins`

- `profile_id`
- `provider`
- `plugin_id`
- `source`
- `install_mode`
- `config_json`
- `installed_state`

### `agent_profile_audit`

- `audit_id`
- `profile_id`
- `actor`
- `action`
- `diff_json`
- `created_at`

---

## Open Questions

- should dashboard-managed profiles be repo-local, global, or both
- should `budgetUsd` live in saved profile, launch defaults, or both
- should `maxContextWindowTokens` be enforced by Frankenbeast directly, by provider wrappers, or initially be informational only
- should plugin installation be synchronous or queued
- should profile apply update local files immediately or only for dashboard-triggered runs

These should be resolved before Phase 4.

---

## Exit Criteria

This effort is complete when:

- operators can manage durable Frankenbeast agent settings from the dashboard
- provider-specific config is modeled per LLM, not flattened
- plugin configuration is first-class and capability-gated
- runtime preview clearly shows what Frankenbeast will actually receive
- apply/export can materialize config without requiring manual CLI flag assembly
- unsupported settings are explicit, not silent no-ops
- write actions are authenticated and audited

---

## First Milestone

The first milestone should be:

**"I can open the dashboard, create an agent profile, set different model and plugin settings for Claude and Codex, validate it, and preview the exact Frankenbeast runtime config that would be applied."**

That is the minimum useful operator configuration flow.
