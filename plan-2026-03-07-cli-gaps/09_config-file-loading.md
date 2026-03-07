# Chunk 09: Config File Loading

## Objective

Wire the existing `config-loader.ts` into `run.ts` so the `--config` flag actually works. The config loader already handles file > env > CLI priority merging — it just needs to be called and its output fed into `SessionConfig`.

## Files

- **Edit**: `franken-orchestrator/src/cli/run.ts`
- **Edit**: `franken-orchestrator/src/cli/session.ts` (add config fields to SessionConfig)
- **Create**: `franken-orchestrator/test/cli/config-loading.test.ts`
- **Read**: `franken-orchestrator/src/cli/config-loader.ts`
- **Read**: `franken-orchestrator/src/config/orchestrator-config.ts`

## Success Criteria

- [ ] `run.ts` calls `loadConfig(args)` after parsing CLI args
- [ ] Config values are passed into `SessionConfig`: `maxCritiqueIterations`, `maxDurationMs`, `enableTracing`, `enableHeartbeat`, `minCritiqueScore`, `maxTotalTokens`
- [ ] `SessionConfig` interface includes optional fields for each config value
- [ ] CLI args override config file values (already handled by `loadConfig` priority)
- [ ] If `--config` is not provided, `loadConfig` still reads env vars and applies defaults
- [ ] If config file doesn't exist, throw a clear error: `Config file not found: <path>`
- [ ] Test: create temp JSON config file, verify `loadConfig` reads and parses it
- [ ] Test: verify CLI args override config file values
- [ ] Test: verify env vars override config file values
- [ ] Test: verify defaults are applied when no config file
- [ ] Logger outputs loaded config source: `[config] Loaded config from /path/to/config.json`
- [ ] `npm run build` succeeds

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/cli/config-loading.test.ts && npm run build
```

## Hardening Requirements

- `loadConfig` is an async function — `run.ts` already uses `async main()` so this is fine
- Do NOT change `config-loader.ts` implementation — it's already correct. Only wire it into `run.ts` and expand `SessionConfig`.
- The `OrchestratorConfigSchema` uses Zod `.default()` for all fields — missing keys get defaults automatically
- If the config file has invalid JSON, let the error propagate with a useful message
- Use the `'config'` service label when logging config info
