# Chunk 03: Config Schema + CLI Args + Config Loader

## Objective

Add `providers` section to `OrchestratorConfigSchema`, update CLI args to accept `--providers` flag and open `--provider` to any string, and ensure config-loader passes through providers config.

Covers original plan Tasks 7, 8, 9, and 10.

## Files

- **Modify**: `franken-orchestrator/src/config/orchestrator-config.ts` (add ProvidersConfig)
- **Modify**: `franken-orchestrator/src/cli/args.ts` (string provider, --providers flag)
- **Modify**: `franken-orchestrator/src/cli/config-loader.ts` (verify providers passthrough)
- **Modify**: `franken-orchestrator/src/skills/cli-types.ts` (remove hardcoded union)
- **Test**: `franken-orchestrator/tests/unit/config/orchestrator-config-providers.test.ts`
- **Test**: `franken-orchestrator/tests/unit/cli/args-providers.test.ts`
- **Test**: `franken-orchestrator/tests/unit/cli/config-loader-providers.test.ts`
- **Modify**: `franken-orchestrator/tests/unit/skills/cli-types.test.ts` (update for string type)
- **Read**: `franken-orchestrator/src/cli/args.ts` (current provider type)
- **Read**: `franken-orchestrator/src/skills/cli-types.ts` (current union type)

## Success Criteria

- [ ] `OrchestratorConfigSchema` includes `providers` section with `default` (string, default 'claude'), `fallbackChain` (string[], default ['claude', 'codex']), `overrides` (record of provider name → { command?, model?, extraArgs? })
- [ ] `parseArgs(['--provider', 'gemini'])` returns `provider: 'gemini'` (any string, not union)
- [ ] `parseArgs(['--providers', 'claude,gemini,aider'])` returns `providers: ['claude', 'gemini', 'aider']`
- [ ] `--provider` normalizes to lowercase
- [ ] `loadConfig()` passes through providers section from config file
- [ ] `RalphLoopConfig.provider` is `string` (not `'claude' | 'codex'`)
- [ ] `RalphLoopConfig` replaces `claudeCmd`/`codexCmd` with single optional `command?: string`
- [ ] All existing args and config tests still pass
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/config/ tests/unit/cli/ tests/unit/skills/cli-types.test.ts
```

## Hardening Requirements

- Read current `args.ts`, `cli-types.ts`, and `orchestrator-config.ts` FIRST — do not use stale snapshots
- `OrchestratorConfigSchema.parse({})` must produce sensible defaults (test this explicitly)
- The `ProviderOverrideSchema` uses `z.object({ command, model, extraArgs })` — all optional
- `--providers` is a comma-separated string parsed into an array
- When `--providers` is not specified, `args.providers` is `undefined` (not an empty array)
- Do NOT modify `ralph-loop.ts` or `cli-llm-adapter.ts` in this chunk — consumer refactors happen in chunks 04-05
- Preserve all existing `args.ts` behavior — only ADD the new flag and widen the type
