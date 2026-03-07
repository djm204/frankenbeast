# Chunk 05: Observer Bridge — Implementation

## Objective

Implement all `CliObserverBridge` methods and the `observerDeps` property so all tests from chunk 04 pass. The bridge must correctly delegate to real `@frankenbeast/observer` classes.

## Files

- **Edit**: `franken-orchestrator/src/adapters/cli-observer-bridge.ts`
- **Edit**: `franken-orchestrator/test/adapters/cli-observer-bridge.test.ts` (add integration tests)

## Success Criteria

- [ ] `CliObserverBridge` constructor instantiates: `TokenCounter()`, `CostCalculator(DEFAULT_PRICING)`, `CircuitBreaker({ limitUsd })`, `LoopDetector()`
- [ ] `startTrace(sessionId)` creates and stores a `TraceContext` for the session
- [ ] `startSpan(name)` returns a `SpanHandle` that delegates to the internal trace context
- [ ] `getTokenSpend()` calls `counter.grandTotal()` and computes cost via `costCalc`
- [ ] `getTokenSpend()` returns `{ inputTokens, outputTokens, totalTokens, estimatedCostUsd }`
- [ ] `observerDeps` property returns object with: `trace`, `counter`, `costCalc`, `breaker`, `loopDetector`, `startSpan`, `endSpan`, `recordTokenUsage`, `setMetadata`
- [ ] `observerDeps.recordTokenUsage` delegates to `counter.record()`
- [ ] `observerDeps.startSpan` creates a child span on the trace
- [ ] All tests from chunk 04 pass (Green phase)
- [ ] New test: record 1000 tokens, verify `getTokenSpend()` returns non-zero cost
- [ ] New test: record tokens exceeding budget, verify `breaker.check()` returns `tripped: true`
- [ ] `npm run typecheck` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/adapters/cli-observer-bridge.test.ts
```

## Hardening Requirements

- `estimatedCostUsd` in `getTokenSpend()` must use the `CostCalculator` with real pricing, not a simple multiplication
- The `observerDeps` methods (`startSpan`, `endSpan`, `recordTokenUsage`, `setMetadata`) must match the exact signatures expected by `CliSkillExecutor` — check `cli-skill-executor.ts` for the shape
- If `TraceContext` from `@frankenbeast/observer` doesn't exist or has different API, use a minimal trace object `{ id: sessionId }` — don't block on missing trace internals
- Handle the case where `startTrace` hasn't been called yet — `getTokenSpend` should return zeros, not crash
