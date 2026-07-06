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
4. Add unit tests for request construction, error handling, and config parsing.
5. Verify from the repo root:

```bash
npm --workspace @franken/orchestrator run typecheck
npm --workspace @franken/orchestrator test
```

## What not to follow

Older docs may mention `frankenfirewall/src/adapters`, `BaseAdapter`, `guardrails.config.json`, or a standalone firewall proxy. Those were pre-consolidation surfaces and are not the current provider extension path in this repo.
