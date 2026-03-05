# Chunk 07a: Logger Utility & Types

## Objective

Create the Logger utility classes (`ConsoleLogger`, `NullLogger`), add `ILogger` to `BeastLoopDeps`, and update test helpers. This chunk does NOT modify phase files — that's chunk 07b.

## Files

- Create: `franken-orchestrator/src/logger.ts`
- Modify: `franken-orchestrator/src/deps.ts` — add `ILogger` interface and `logger` to `BeastLoopDeps`
- Modify: `franken-orchestrator/tests/helpers/stubs.ts` — add `makeLogger()` stub
- Modify: `franken-orchestrator/tests/helpers/in-memory-ports.ts` — add `InMemoryLogger`
- Modify: `franken-orchestrator/tests/helpers/test-orchestrator-factory.ts` — include logger in deps
- Create: `franken-orchestrator/tests/unit/logger.test.ts`

## Success Criteria

- [ ] `ILogger` interface in `deps.ts`: `info(msg, data?)`, `debug(msg, data?)`, `warn(msg, data?)`, `error(msg, data?)`
- [ ] `ConsoleLogger` implements `ILogger` — constructor takes `{ verbose: boolean }`
- [ ] `ConsoleLogger.info()` always prints (prefixed `[beast]`)
- [ ] `ConsoleLogger.debug()` only prints when `verbose: true` (prefixed `[beast:debug]`)
- [ ] `ConsoleLogger.warn()` always prints (prefixed `[beast:warn]`)
- [ ] `ConsoleLogger.error()` always prints to stderr (prefixed `[beast:error]`)
- [ ] `NullLogger` implements `ILogger` — all methods are no-ops
- [ ] `BeastLoopDeps` extended with `readonly logger: ILogger`
- [ ] `makeLogger()` stub returns vi.fn()-based logger
- [ ] `InMemoryLogger` captures entries in `entries: Array<{ level: string; msg: string; data?: unknown }>`
- [ ] `createTestOrchestrator()` includes logger in deps
- [ ] Unit tests for ConsoleLogger verbose/non-verbose behavior
- [ ] All existing tests pass
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

### Logger Design
- `info` = user-facing (phase transitions, results, summaries)
- `debug` = developer-facing (raw data, input/output details, timing)
- `warn` = user-facing (violations, degraded behavior)
- `error` = user-facing (failures, aborts)
- `data` parameter is optional — when provided, `debug` shows it as JSON, `info` ignores it
- Timestamps in ISO format prepended to all messages

### Test Helpers
- `makeLogger()` returns `{ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }`
- `InMemoryLogger` stores entries for assertion
- `createTestOrchestrator()` uses `NullLogger` by default so existing tests are unaffected

### What NOT to Log
- Do not log raw user input (PII risk) — log "input received" with character count
- Do not log full LLM prompts at info level — debug only
- Do not log API keys or env var values
