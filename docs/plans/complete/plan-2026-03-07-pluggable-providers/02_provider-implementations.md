# Chunk 02: Built-in Provider Implementations (Claude, Codex, Gemini, Aider)

## Objective

Implement the 4 built-in `ICliProvider` implementations and wire them into `createDefaultRegistry()`. Each provider encapsulates its own arg building, output normalization, env filtering, rate-limit detection, and token estimation.

Covers original plan Tasks 2, 3, 4, and 5, plus wiring into Task 6's `createDefaultRegistry()`.

## Files

- **Create**: `franken-orchestrator/src/skills/providers/claude-provider.ts`
- **Create**: `franken-orchestrator/src/skills/providers/codex-provider.ts`
- **Create**: `franken-orchestrator/src/skills/providers/gemini-provider.ts`
- **Create**: `franken-orchestrator/src/skills/providers/aider-provider.ts`
- **Modify**: `franken-orchestrator/src/skills/providers/cli-provider.ts` (wire `createDefaultRegistry`)
- **Modify**: `franken-orchestrator/src/skills/providers/index.ts` (add exports)
- **Test**: `franken-orchestrator/tests/unit/skills/providers/claude-provider.test.ts`
- **Test**: `franken-orchestrator/tests/unit/skills/providers/codex-provider.test.ts`
- **Test**: `franken-orchestrator/tests/unit/skills/providers/gemini-provider.test.ts`
- **Test**: `franken-orchestrator/tests/unit/skills/providers/aider-provider.test.ts`
- **Read**: `franken-orchestrator/src/skills/ralph-loop.ts` (extract existing Claude/Codex logic)

## Success Criteria

- [ ] `ClaudeProvider`: builds `claude --print` args, strips `CLAUDE*` env vars, supports stream-json, detects rate limits, parses retry-after
- [ ] `CodexProvider`: builds `codex exec --full-auto --json` args, no env filtering, normalizes JSON output to text via `tryExtractTextFromNode`
- [ ] `GeminiProvider`: builds `gemini -p` args with `--yolo --output-format stream-json`, strips `GEMINI*`/`GOOGLE*` env vars, detects `RESOURCE_EXHAUSTED`
- [ ] `AiderProvider`: builds `aider --message` args with `--yes-always --no-stream --no-auto-commits`, strips `AIDER*` env vars, strips ANSI codes from output, delegates rate-limiting to LiteLLM (always returns false)
- [ ] `createDefaultRegistry()` returns registry with all 4 providers registered in order: claude, codex, gemini, aider
- [ ] Each provider has 8-11 tests covering all interface methods
- [ ] All provider tests pass
- [ ] Barrel `index.ts` updated to export all 4 provider classes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/skills/providers/
```

## Hardening Requirements

- Extract `ClaudeProvider` logic from existing `ralph-loop.ts` functions: `buildClaudeArgs`, `RATE_LIMIT_PATTERNS`, `parseResetTime`, env filtering logic — do NOT invent new behavior
- Extract `CodexProvider` logic from existing `ralph-loop.ts`: `buildCodexArgs`, `normalizeCodexOutput`/`tryExtractTextFromNode`
- `GeminiProvider` and `AiderProvider` are NEW — follow the design doc patterns
- `AiderProvider.isRateLimited()` always returns `false` — Aider uses LiteLLM which handles retries internally
- `AiderProvider.normalizeOutput()` strips ANSI escape codes
- `GeminiProvider` env filtering: strip both `GEMINI*` and `GOOGLE*` prefixed vars
- Each provider's `filterEnv()` must return a COPY (spread), never mutate the input
- Do NOT modify `ralph-loop.ts` yet — that happens in chunk 05
