# Pluggable CLI Provider Registry

> Design doc for modular CLI agent provider support in franken-orchestrator.

**Date**: 2026-03-07
**Status**: Approved
**Branch**: TBD (will be created during implementation)

## Problem

The orchestrator hardcodes CLI agent support as a `'claude' | 'codex'` union type with if/else dispatch scattered across `ralph-loop.ts`, `cli-llm-adapter.ts`, `args.ts`, `dep-factory.ts`, and `session.ts`. Adding new providers (Gemini CLI, Aider, future Warp, API-key providers) means touching 5+ files per provider with no isolation or testability.

## Decision

Extract each CLI agent into a self-contained `ICliProvider` implementation behind a `ProviderRegistry`. RalphLoop and CliLlmAdapter consume the registry instead of hardcoded dispatch. Providers are config-driven with CLI arg overrides.

## Approach: Provider Registry (Plugin Pattern)

**Rejected alternatives:**
- **Config-driven dispatch (data, not code)**: Can't express complex parsing differences (Aider plain text vs Claude stream-json) without escape hatches that recreate the plugin pattern.
- **Keep hardcoded, add branches**: Doesn't scale. RalphLoop becomes a god function. Every new provider touches 5+ files.

## Scope

### In Scope
- `ICliProvider` interface and `ProviderRegistry`
- 4 built-in providers: Claude, Codex, Gemini CLI, Aider
- Refactor RalphLoop + CliLlmAdapter to registry-driven dispatch
- Config schema `providers` section (default, fallbackChain, overrides)
- `--providers` CLI flag for fallback chain
- Fail-fast validation on unknown provider names
- Per-provider unit tests, registry tests, refactored existing tests
- ADR, ARCHITECTURE.md, RAMP_UP.md updates

### Out of Scope
- Warp (pinned — terminal host, not a CLI agent; revisit if `warp ai` gains non-interactive mode)
- API-key providers (future — the interface accommodates them without rework)
- Provider auto-detection (checking which CLIs are installed)

## Design

### 1. ICliProvider Interface

```typescript
interface ICliProvider {
  readonly name: string;        // 'claude' | 'codex' | 'gemini' | 'aider'
  readonly command: string;     // default binary ('claude', 'codex', 'gemini', 'aider')

  buildArgs(prompt: string, opts: ProviderOpts): string[];
  normalizeOutput(raw: string): string;
  estimateTokens(raw: string): number;
  isRateLimited(stderr: string, stdout: string): boolean;
  parseRetryAfter(stderr: string, stdout: string): number | null; // ms until retry
  filterEnv(env: Record<string, string>): Record<string, string>;
  supportsStreamJson(): boolean;
}

interface ProviderOpts {
  maxTurns?: number;
  timeoutMs?: number;
  workingDir?: string;
  model?: string;           // from config overrides
  extraArgs?: string[];     // from config overrides
  commandOverride?: string; // from config overrides
}
```

- `supportsStreamJson()` determines whether RalphLoop uses `StreamLineBuffer` (Claude, Gemini) or plain text capture (Codex, Aider).
- `filterEnv()` co-locates env-stripping with the provider that needs it.
- `normalizeOutput()` handles JSON extraction vs plain text passthrough.

### 2. ProviderRegistry

```typescript
class ProviderRegistry {
  private providers = new Map<string, ICliProvider>();

  register(provider: ICliProvider): void;
  get(name: string): ICliProvider;    // throws if not found
  has(name: string): boolean;
  names(): string[];                  // for CLI --help, validation
}

function createDefaultRegistry(): ProviderRegistry; // pre-registers all 4 built-ins
```

### 3. Built-in Provider Implementations

File structure:

```
src/skills/providers/
  cli-provider.ts          # ICliProvider, ProviderOpts, ProviderRegistry
  claude-provider.ts       # ClaudeProvider
  codex-provider.ts        # CodexProvider
  gemini-provider.ts       # GeminiProvider
  aider-provider.ts        # AiderProvider
```

Provider comparison:

| | Claude | Codex | Gemini | Aider |
|---|---|---|---|---|
| buildArgs | `--print --dangerously-skip-permissions --output-format stream-json --verbose --disable-slash-commands --no-session-persistence --plugin-dir /dev/null --max-turns N -- prompt` | `exec --full-auto --json --color never prompt` | `-p "prompt" --yolo --output-format stream-json` | `--message "prompt" --yes-always --no-stream --no-auto-commits` |
| normalizeOutput | StreamLineBuffer JSON extraction | Codex JSON extraction | StreamLineBuffer JSON extraction | Plain text passthrough (strip ANSI) |
| estimateTokens | `stdout.length / 4` | `stdout.length / 16` | `stdout.length / 4` | `stdout.length / 4` |
| filterEnv | Strip all `CLAUDE*` vars | No-op | Strip `GEMINI*`, `GOOGLE*` vars | Strip `AIDER*` vars |
| supportsStreamJson | `true` | `false` | `true` | `false` |
| isRateLimited | `rate limit`, `retry-after` patterns | `resets in` pattern | `RESOURCE_EXHAUSTED` pattern | LiteLLM handles internally (return false) |
| model support | N/A (uses authenticated CLI) | N/A | `-m model` via opts.model | `--model model` via opts.model |

**Aider-specific**: Git auto-commit disabled (`--no-auto-commits`) — `GitBranchIsolator` handles all git operations uniformly across providers.

### 4. Config Schema

Addition to `OrchestratorConfigSchema`:

```typescript
const ProviderOverrideSchema = z.object({
  command: z.string().optional(),
  model: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

const ProvidersConfigSchema = z.object({
  default: z.string().default('claude'),
  fallbackChain: z.array(z.string()).default(['claude', 'codex']),
  overrides: z.record(z.string(), ProviderOverrideSchema).default({}),
});
```

Example `.frankenbeast/config.json`:

```json
{
  "providers": {
    "default": "gemini",
    "fallbackChain": ["gemini", "claude", "aider"],
    "overrides": {
      "gemini": { "command": "/usr/local/bin/gemini", "model": "gemini-2.5-pro" },
      "aider": { "model": "anthropic/claude-sonnet-4-20250514" },
      "claude": { "extraArgs": ["--max-turns", "5"] }
    }
  }
}
```

Merge precedence: `CLI args > env vars > config file > defaults`

### 5. CLI Args Changes

- `--provider <name>` — stays (overrides `config.providers.default`)
- `--providers <names>` — new, comma-separated fallback chain (overrides `config.providers.fallbackChain`)
- Both validated against `registry.names()` at parse time

### 6. Integration Points

**Files that change (refactor):**

| File | Change |
|------|--------|
| `cli-types.ts` | `provider: string` (was union). Remove `claudeCmd`/`codexCmd`, add `command?: string`. `providers` chain becomes `string[]`. |
| `ralph-loop.ts` | Constructor takes `ProviderRegistry`. Remove `buildClaudeArgs()`, `buildCodexArgs()`, `normalizeCodexOutput()`, inline env-stripping. Replace with `registry.get(provider).*()` calls. `StreamLineBuffer` gated on `supportsStreamJson()`. |
| `cli-llm-adapter.ts` | Constructor takes `ICliProvider`. Delegates to provider for args/env/normalization. |
| `args.ts` | `--provider` accepts any registered name. Add `--providers` flag. Validate against registry. |
| `dep-factory.ts` | Creates `ProviderRegistry`, passes to `RalphLoop` and `CliLlmAdapter`. Applies config overrides. |
| `session.ts` | Replace `'claude' \| 'codex'` references with `string`. |
| `config-loader.ts` | Merge `providers` section from config file. |
| `orchestrator-config.ts` | Add `ProvidersConfigSchema` to `OrchestratorConfigSchema`. |

**Files that DON'T change:** `CliSkillExecutor`, `GitBranchIsolator`, `BeastLoop`, phases, breakers, checkpoint — already provider-agnostic.

**New files:**

| File | Purpose |
|------|---------|
| `src/skills/providers/cli-provider.ts` | `ICliProvider`, `ProviderOpts`, `ProviderRegistry`, `createDefaultRegistry()` |
| `src/skills/providers/claude-provider.ts` | `ClaudeProvider` |
| `src/skills/providers/codex-provider.ts` | `CodexProvider` |
| `src/skills/providers/gemini-provider.ts` | `GeminiProvider` |
| `src/skills/providers/aider-provider.ts` | `AiderProvider` |

**Documentation updates:**

| File | Change |
|------|---------|
| `docs/ARCHITECTURE.md` | Add provider registry to component diagram, update CLI pipeline section |
| `docs/RAMP_UP.md` | Update orchestrator internals tree, CLI pipeline section, known limitations |
| `docs/adr/009-pluggable-cli-providers.md` | New ADR documenting this decision |

### 7. Test Strategy

- **Per-provider unit tests**: `buildArgs`, `normalizeOutput`, `isRateLimited`, `filterEnv`, `estimateTokens` for each of the 4 providers.
- **Registry tests**: register, get, has, names, unknown-provider error.
- **Refactored RalphLoop tests**: Inject mock `ICliProvider` instead of testing provider-specific logic inline.
- **Refactored CliLlmAdapter tests**: Same — inject provider, verify delegation.
- **Config integration tests**: Config file loading, merge precedence, override application, validation errors.
- **CLI args tests**: `--providers` parsing, validation against registry.

### 8. Future Extensibility

- **API-key providers**: `ICliProvider` works as-is. A future `AnthropicApiProvider` would use `filterEnv` to inject API keys, `buildArgs` to construct invocation args. Register and go.
- **Warp**: If `warp ai` gains non-interactive mode, it slots in as another `ICliProvider`. If not, it lives outside this abstraction.
- **Custom/community providers**: Users could implement `ICliProvider` and register via a plugin hook (not in scope now, but the registry supports it).
