# Chunk 07b: Logger Phase Integration

## Objective

Thread the logger through `BeastLoop.run()` and all five phase functions so every major step is logged. Uses the `ILogger` and `NullLogger` from chunk 07a.

## Files

- Modify: `franken-orchestrator/src/beast-loop.ts` — pass logger to all phase calls
- Modify: `franken-orchestrator/src/phases/ingestion.ts` — add logger parameter + logging
- Modify: `franken-orchestrator/src/phases/hydration.ts` — add logger parameter + logging
- Modify: `franken-orchestrator/src/phases/planning.ts` — add logger parameter + logging
- Modify: `franken-orchestrator/src/phases/execution.ts` — add logger parameter + logging
- Modify: `franken-orchestrator/src/phases/closure.ts` — add logger parameter + logging

## Context

`ILogger` and `NullLogger` are in `franken-orchestrator/src/logger.ts` (from chunk 07a).

`BeastLoopDeps` now has `readonly logger: ILogger` (from chunk 07a).

Phase function signatures (current — before this chunk):
```typescript
runIngestion(ctx, firewall)
runHydration(ctx, memory)
runPlanning(ctx, planner, critique, config)
runExecution(ctx, skills, governor, memory, observer)
runClosure(ctx, observer, heartbeat, config, outcomes)
```

`BeastLoop.run()` in `beast-loop.ts`:
```typescript
await runIngestion(ctx, this.deps.firewall);
await runHydration(ctx, this.deps.memory);
await runPlanning(ctx, this.deps.planner, this.deps.critique, this.config);
const outcomes = await runExecution(ctx, this.deps.skills, this.deps.governor, this.deps.memory, this.deps.observer);
return await runClosure(ctx, this.deps.observer, this.deps.heartbeat, this.config, outcomes);
```

## Success Criteria

- [ ] `BeastLoop.run()` logs at info level: session start, each phase start/end, final result status + duration
- [ ] `BeastLoop.run()` logs at debug level: session ID, project ID, config values
- [ ] `runIngestion()` accepts optional `logger` (last param, defaults to `NullLogger`) — logs: input received (char count), firewall violations, blocked status
- [ ] `runHydration()` accepts optional `logger` — logs: memory frontloaded, context loaded (ADR count, rule count)
- [ ] `runPlanning()` accepts optional `logger` — logs: plan created (task count), critique verdict/score, re-plan iterations
- [ ] `runExecution()` accepts optional `logger` — logs: each task start/end, skill ID, governor decisions, failures
- [ ] `runClosure()` accepts optional `logger` — logs: token spend summary, heartbeat result
- [ ] All existing tests pass (NullLogger default = no-op = backward compatible)
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

- Add `logger` as the LAST parameter to each phase function to maintain backward compatibility
- Default `logger` to `new NullLogger()` if not provided: `logger: ILogger = new NullLogger()`
- Import `ILogger` from `../deps.js` and `NullLogger` from `../logger.js`
- `BeastLoop.run()` passes `this.deps.logger` to every phase call
- Log at `info` level: phase transitions, task completions, final result
- Log at `debug` level: raw inputs, full contexts, token counts, timing per task
- Do NOT change existing function signatures in a breaking way — logger is always optional
- Error catch blocks in beast-loop.ts should log at `error` level before returning error result
