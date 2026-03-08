# Chunk 06: Wire ProviderRegistry into dep-factory, session, and run.ts

## Objective

Update `dep-factory.ts`, `session.ts`, and `run.ts` to create and use `ProviderRegistry`. Add fail-fast validation for unknown provider names at startup.

Covers original plan Tasks 13, 14, and 15.

## Files

- **Modify**: `franken-orchestrator/src/cli/dep-factory.ts`
- **Modify**: `franken-orchestrator/src/cli/session.ts`
- **Modify**: `franken-orchestrator/src/cli/run.ts`
- **Test**: `franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`
- **Read**: `franken-orchestrator/src/cli/dep-factory.ts` (CRITICAL: read first, PR #12 added significant wiring)
- **Read**: `franken-orchestrator/src/cli/session.ts`
- **Read**: `franken-orchestrator/src/cli/run.ts`

## Success Criteria

- [ ] `CliDepOptions.provider` type widened to `string`
- [ ] `CliDepOptions` gains `providers?: string[]` and `providersConfig?` fields
- [ ] `createCliDeps()` creates `ProviderRegistry` via `createDefaultRegistry()`
- [ ] `createCliDeps()` resolves provider via `registry.get()` — fail-fast on unknown name
- [ ] `RalphLoop` constructed with `new RalphLoop(registry)`
- [ ] `CliLlmAdapter` constructed with `new CliLlmAdapter(resolvedProvider, { workingDir, commandOverride })`
- [ ] ALL existing wiring PRESERVED: `AdapterLlmClient`, `PrCreator`, `commitMessageFn`, `verifyCommand`, `CliSkillExecutor`
- [ ] `SessionConfig.provider` widened to `string`, gains `providers?: string[]`
- [ ] `run.ts` wires `config.providers.default` and `config.providers.fallbackChain` into `SessionConfig`
- [ ] CLI `--provider` overrides config default; `--providers` overrides fallback chain
- [ ] Test: unknown provider throws descriptive error
- [ ] Test: all 4 built-in providers accepted without error
- [ ] Full orchestrator test suite passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/ && npx vitest run
```

## Hardening Requirements

- **CRITICAL**: Read current `dep-factory.ts` FIRST. PR #12 added:
  - `AdapterLlmClient` wrapping the adapter for LLM-powered PR titles
  - `PrCreator` using `adapterLlm`
  - `commitMessageFn` delegating to `prCreator.generateCommitMessage()`
  - `verifyCommand = 'npx tsc --noEmit'` passed to `CliSkillExecutor`
  - These lines must be PRESERVED exactly
- Provider overrides from config (`command`, `model`, `extraArgs`) should be applied when constructing the provider opts
- `run.ts` precedence: CLI args > env vars > config file > defaults
- Do NOT modify provider implementations or RalphLoop in this chunk
