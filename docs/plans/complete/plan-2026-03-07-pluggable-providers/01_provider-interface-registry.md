# Chunk 01: ICliProvider Interface + ProviderRegistry + Barrel Export

## Objective

Create the `ICliProvider` interface, `ProviderRegistry` class, `createDefaultRegistry()` factory, and barrel export. This is the foundation all other chunks depend on.

Covers original plan Tasks 1 and 6.

## Files

- **Create**: `franken-orchestrator/src/skills/providers/cli-provider.ts`
- **Create**: `franken-orchestrator/src/skills/providers/index.ts`
- **Test**: `franken-orchestrator/tests/unit/skills/providers/cli-provider.test.ts`

## Success Criteria

- [ ] `ICliProvider` interface exported with: `name`, `command`, `buildArgs()`, `normalizeOutput()`, `estimateTokens()`, `isRateLimited()`, `parseRetryAfter()`, `filterEnv()`, `supportsStreamJson()`
- [ ] `ProviderOpts` interface exported with: `maxTurns?`, `timeoutMs?`, `workingDir?`, `model?`, `extraArgs?`, `commandOverride?`
- [ ] `ProviderRegistry` class with `register()`, `get()`, `has()`, `names()` methods
- [ ] `get()` throws on unknown provider with descriptive error listing available names
- [ ] `createDefaultRegistry()` stub exported (returns empty registry for now — providers added in chunk 02)
- [ ] Barrel `index.ts` re-exports all public types and classes
- [ ] All tests pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/skills/providers/cli-provider.test.ts
```

## Hardening Requirements

- `ProviderRegistry` must be a class (not a plain Map) — it validates on `get()` and provides `names()` for error messages
- `createDefaultRegistry()` returns a NEW instance each call (no shared mutable state)
- Do NOT implement any concrete providers in this chunk — only the interface and registry
- `createDefaultRegistry()` will initially register zero providers; chunk 02 adds them
- All types must be exported from the barrel
