# Chunk 04: Refactor RalphLoop to Use ProviderRegistry

## Objective

Replace all hardcoded `'claude' | 'codex'` dispatch in `ralph-loop.ts` with `ProviderRegistry` lookup. This is the largest single refactor — RalphLoop gets a registry injected via constructor and delegates arg building, env filtering, output normalization, rate-limit detection, and token estimation to the resolved `ICliProvider`.

Covers original plan Task 11.

## Files

- **Modify**: `franken-orchestrator/src/skills/ralph-loop.ts`
- **Modify**: `franken-orchestrator/tests/unit/skills/ralph-loop.test.ts`
- **Read**: `franken-orchestrator/src/skills/providers/cli-provider.ts` (ICliProvider interface)
- **Read**: `franken-orchestrator/src/skills/providers/index.ts` (createDefaultRegistry)

## Success Criteria

- [ ] `RalphLoop` constructor accepts optional `ProviderRegistry` (defaults to `createDefaultRegistry()`)
- [ ] `buildClaudeArgs` and `buildCodexArgs` functions REMOVED from ralph-loop.ts
- [ ] `normalizeCodexOutput` / `tryExtractTextFromNode` REMOVED from ralph-loop.ts (lives in CodexProvider now)
- [ ] Inline `RATE_LIMIT_PATTERNS` and `isRateLimited` REMOVED from ralph-loop.ts (lives in providers now)
- [ ] `spawnIteration` uses `provider.command`, `provider.buildArgs()`, `provider.filterEnv()`
- [ ] Stream-json buffer used only when `provider.supportsStreamJson()` is true
- [ ] `run()` method uses `provider.normalizeOutput()`, `provider.estimateTokens()`, `provider.isRateLimited()`, `provider.parseRetryAfter()`
- [ ] `parseResetTime` kept as a fallback when `provider.parseRetryAfter()` returns null
- [ ] `StreamLineBuffer` and `processStreamLine` stay in ralph-loop.ts (shared utility)
- [ ] All existing ralph-loop tests updated and pass
- [ ] New test: `'accepts custom provider via registry'`
- [ ] Full orchestrator test suite passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/skills/ralph-loop.test.ts && npx vitest run
```

## Hardening Requirements

- Read current `ralph-loop.ts` FIRST — it was modified in PR #12 and may have changed
- The refactor must be behavior-preserving: same args, same env filtering, same output normalization for Claude and Codex as before
- `activeProvider` variable type changes from `'claude' | 'codex'` to `string`
- Provider resolution: `this.registry.get(activeProvider)` — fails fast on unknown
- Keep `parseResetTime` exported as a generic fallback — it's used when provider-specific parsing returns null
- Do NOT touch `CliLlmAdapter` in this chunk — that's chunk 05
- Test helper `baseConfig()` must update: remove `claudeCmd`/`codexCmd`, use `command?: string`
