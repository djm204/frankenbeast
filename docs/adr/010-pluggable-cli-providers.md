# ADR 010: Pluggable CLI Providers

## Status

Accepted

## Context

The orchestrator hardcoded CLI agent support as a `'claude' | 'codex'` union type with if/else dispatch scattered across `martin-loop.ts`, `cli-llm-adapter.ts`, `args.ts`, `dep-factory.ts`, and `session.ts`. Adding a new provider (e.g., Gemini CLI, Aider) required touching 5+ files with no isolation or testability. Rate-limit handling, env-var filtering, and output normalization were inlined per provider.

ADR-009 explicitly deferred additional CLI provider support beyond claude/codex.

## Decision

1. **`ICliProvider` interface.** Each provider is a single class implementing `ICliProvider` with 8 methods: `buildArgs`, `normalizeOutput`, `estimateTokens`, `isRateLimited`, `parseRetryAfter`, `filterEnv`, `supportsStreamJson`, plus `name`/`command` properties.

2. **`ProviderRegistry`.** In-memory registry with `register(provider)`, `get(name)`, `has(name)`, `names()`. `createDefaultRegistry()` registers all built-in providers.

3. **Four built-in providers.** `ClaudeProvider`, `CodexProvider`, `GeminiProvider`, `AiderProvider` — each in a single file under `src/skills/providers/`.

4. **Provider-agnostic consumers.** `MartinLoop` accepts a `ProviderRegistry` at construction and resolves providers by name from a fallback chain. `CliLlmAdapter` accepts an `ICliProvider` instance directly.

5. **CLI flags.** `--provider <name>` sets the primary provider (default: `claude`). `--providers <list>` sets the comma-separated fallback chain for rate-limit cascading.

6. **Config file overrides.** The `providers` section in config supports `default`, `fallbackChain`, and per-provider `overrides` (command path, model, extra args).

## Consequences

- **Single-file provider addition**: new providers require only one file implementing `ICliProvider` and one `register()` call in `createDefaultRegistry()`
- **Provider-agnostic MartinLoop and CliLlmAdapter**: no provider-specific logic outside provider classes
- **Config file overrides**: users can customize command paths, models, and extra args per provider without code changes
- **Rate-limit fallback chain**: MartinLoop cascades through providers on rate limits, parsing provider-specific retry-after headers
- **Warp deferred**: Warp is a terminal host, not a CLI agent — it does not fit the `ICliProvider` interface and is deferred to a separate integration path

## Supersedes

Partially supersedes ADR-009 (the "Additional CLI provider support is deferred" consequence is now resolved).
