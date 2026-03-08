# Issue: CLI Config Surface Is Not Applied End-to-End

Severity: high
Area: `franken-orchestrator` CLI

## Summary

The CLI loads and stores orchestrator config, but execution does not actually apply most of it.

## Intended Behavior

`--config`, env, and defaults should affect real execution behavior for planning, tracing, critique thresholds, provider defaults, and other documented knobs.

## Current Behavior

- `run.ts` loads config and passes `maxCritiqueIterations`, `maxDurationMs`, `enableTracing`, `enableHeartbeat`, `minCritiqueScore`, and `maxTotalTokens` into `Session`.
- `Session` stores those fields, but `runExecute()` constructs `new BeastLoop(fullDeps)` without passing any config overrides.
- `args.ts` defaults `provider` to `claude`, so `config.providers.default` is never used when the flag is omitted.
- `dep-factory.ts` only consumes `providersConfig[provider].command`; `model` and `extraArgs` are defined in schema but not wired.
- `maxDurationMs` and `maxTotalTokens` are defined in config, but there is no execution-path enforcement.

## Evidence

- `franken-orchestrator/src/cli/run.ts:120-141`
- `franken-orchestrator/src/cli/session.ts:21-51`
- `franken-orchestrator/src/cli/session.ts:239-242`
- `franken-orchestrator/src/cli/args.ts:96-114`
- `franken-orchestrator/src/cli/dep-factory.ts:129-160`
- `franken-orchestrator/src/config/orchestrator-config.ts:18-39`

## Impact

- Users can believe config is active when it is not.
- Safety and runtime expectations drift from the documented interface.
- Provider config is partially dead code.

## Acceptance Criteria

- Pass effective config into `BeastLoop` in CLI execution mode.
- Use `config.providers.default` when `--provider` is omitted.
- Either wire `model` and `extraArgs` through provider execution paths or remove them from public config.
- Either enforce `maxDurationMs` and `maxTotalTokens` or remove them from the supported config surface.
