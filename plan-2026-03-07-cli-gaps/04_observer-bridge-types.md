# Chunk 04: Observer Bridge — Types & Tests

## Objective

Create the `CliObserverBridge` type definitions and failing tests. This class bridges the gap between `@frankenbeast/observer` classes (TokenCounter, CostCalculator, CircuitBreaker, LoopDetector) and the two interfaces the orchestrator needs: `IObserverModule` (for BeastLoopDeps) and `ObserverDeps` (for CliSkillExecutor).

## Files

- **Create**: `franken-orchestrator/src/adapters/cli-observer-bridge.ts`
- **Create**: `franken-orchestrator/test/adapters/cli-observer-bridge.test.ts`
- **Read** (for IObserverModule): `franken-orchestrator/src/deps.ts`
- **Read** (for ObserverDeps): `franken-orchestrator/src/skills/cli-skill-executor.ts`
- **Read** (for observer APIs): `franken-observer/src/index.ts`

## Success Criteria

- [ ] `CliObserverBridgeConfig` interface exported: `{ budgetLimitUsd: number }`
- [ ] `CliObserverBridge` class skeleton implements `IObserverModule`
- [ ] `CliObserverBridge` exposes `readonly observerDeps: ObserverDeps` property
- [ ] All `IObserverModule` methods stubbed: `startTrace`, `startSpan`, `getTokenSpend`
- [ ] Test file has tests for:
  - Constructor creates internal TokenCounter, CostCalculator, CircuitBreaker, LoopDetector
  - `startTrace()` initializes a trace context
  - `startSpan()` returns a SpanHandle with `end()` method
  - `getTokenSpend()` returns token totals from internal counter
  - `getTokenSpend()` returns estimated cost from internal CostCalculator
  - `observerDeps` exposes `counter`, `costCalc`, `breaker`, `loopDetector` properties
  - `observerDeps.breaker.check(spendUsd)` returns `{ tripped: true }` when spend exceeds budget
- [ ] All tests fail (Red phase)
- [ ] `npm run typecheck` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/adapters/cli-observer-bridge.test.ts 2>&1 | tail -20
```

## Hardening Requirements

- Import from `@frankenbeast/observer` — use the real classes, not stubs
- `CostCalculator` constructor requires `DEFAULT_PRICING` from `@frankenbeast/observer`
- `CircuitBreaker` constructor requires `{ limitUsd: number }`
- `LoopDetector` constructor is optional args `{ windowSize?: number, repeatThreshold?: number }`
- `TokenCounter` constructor takes no args
- The `ObserverDeps` type is defined inline in `cli-skill-executor.ts` — import or re-export it, do NOT duplicate
- Ensure `franken-orchestrator/package.json` has `@frankenbeast/observer` as a dependency (add if missing)
