# Adding an LLM Provider

Frankenbeast's current provider extension points live in `@franken/orchestrator`, not in the deleted pre-consolidation `frankenfirewall` package.

## Current provider surfaces

| Surface | Location | Use for |
|---------|----------|---------|
| CLI execution providers | `packages/franken-orchestrator/src/skills/providers/` | Child-process agents used by chunk execution (`claude`, `codex`, `gemini`, `aider`). Also back `frankenbeast chat` and dashboard chat: both resolve a provider from `createDefaultRegistry()` and wrap it with `CliLlmAdapter`. |
| API provider registry | `packages/franken-orchestrator/src/providers/` | API-backed provider clients/registry (`ProviderRegistry`) used by beast-mode deps and HTTP skill/provider routes. Adding a client here does **not** wire it into chat — chat turns run through the CLI providers above. |
| Config schema/loading | `packages/franken-orchestrator/src/config/` | Provider defaults, fallback chains, model/command overrides, and secret references. |

The root CLI flags are `--provider <name>` for the primary provider and `--providers <list>` for fallback chains.

## Adding a CLI execution provider

1. Add a provider class under `packages/franken-orchestrator/src/skills/providers/` that implements `ICliProvider` from `cli-provider.ts`.
2. Define argument construction, output normalization, token estimation, rate-limit detection, retry-after parsing, environment filtering, stream-json/native-session capabilities, and default context-window size.
3. Register it in `createDefaultRegistry()` in `cli-provider.ts`.
4. Add focused tests near the existing provider tests.
5. Verify from the repo root:

```bash
npm --workspace @franken/orchestrator run typecheck
npm --workspace @franken/orchestrator test -- tests/unit/skills
```

## Adding an API provider

> To add a provider for `frankenbeast chat`/dashboard chat, follow "Adding a CLI execution provider" above — chat is driven by the CLI provider registry through `CliLlmAdapter`.

1. Add the provider implementation under `packages/franken-orchestrator/src/providers/` following the existing provider registry/client patterns.
2. Add config schema support under `packages/franken-orchestrator/src/config/` if the provider needs new settings.
3. Keep secrets referenced through the configured secret backend or environment variables; do not hard-code tokens in config examples.
4. Add unit tests for request construction, error handling, config parsing, and failover audit metadata. API-provider failover through `ProviderRegistry` emits a `model-provider.failover` audit event with `from`, `to`, `reason`, `brainSnapshotHash`, `category: "availability"`, and operator guidance; keep that payload structured so dashboard/liveness tooling can correlate a provider outage with the handoff snapshot.
5. Verify from the repo root:

```bash
npm --workspace @franken/orchestrator run typecheck
npm --workspace @franken/orchestrator test
```

## What not to follow

Older docs may mention `frankenfirewall/src/adapters`, `BaseAdapter`, `guardrails.config.json`, or a standalone firewall proxy. Those were pre-consolidation surfaces and are not the current provider extension path in this repo.

Historical `GeminiAdapter` and `MistralAdapter` references belonged to the deleted `frankenfirewall` package. They were placeholder adapter shells, remained unimplemented, and are not supported public APIs in the current monorepo. Do not import, document, or extend those class names for new provider work. `GeminiProvider` is the supported Gemini CLI provider under `packages/franken-orchestrator/src/skills/providers/`. There is no supported Mistral provider until a new current-surface provider is implemented and registered there.
