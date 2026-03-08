# Chunk 05: Refactor CliLlmAdapter to Use ICliProvider

## Objective

Replace `CliLlmAdapterConfig` with `ICliProvider` injection in `CliLlmAdapter`. The adapter becomes provider-agnostic: it delegates arg building, env filtering, and output parsing to the injected provider.

Covers original plan Task 12.

## Files

- **Modify**: `franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- **Modify**: `franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`
- **Read**: `franken-orchestrator/src/skills/providers/cli-provider.ts` (ICliProvider)
- **Read**: `franken-orchestrator/src/skills/providers/claude-provider.ts` (for test injection)

## Success Criteria

- [ ] `CliLlmAdapterConfig` interface REMOVED
- [ ] Constructor takes `(provider: ICliProvider, opts: { workingDir, timeoutMs?, commandOverride? }, _spawnFn?)`
- [ ] `execute()` uses `provider.command`, `provider.buildArgs()`, `provider.filterEnv()`
- [ ] `transformResponse()` uses `provider.supportsStreamJson()` to choose parsing path
- [ ] `CliLlmAdapter` still implements `IAdapter` — no interface change
- [ ] All existing cli-llm-adapter tests updated and pass
- [ ] Tests inject `ClaudeProvider` and `CodexProvider` to verify both paths
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/adapters/cli-llm-adapter.test.ts && npx vitest run
```

## Hardening Requirements

- Read current `cli-llm-adapter.ts` FIRST — it was added in PR #12 and the exact shape matters
- The `AdapterLlmClient(cliLlmAdapter)` wrapper in `dep-factory.ts` must continue to work — `CliLlmAdapter` still implements `IAdapter`
- `tryExtractTextFromNode` may exist in this file for `transformResponse` — if so, keep it local (it's also in `CodexProvider` but the adapter uses it differently for response transformation)
- Do NOT modify `dep-factory.ts` in this chunk — that's chunk 06
