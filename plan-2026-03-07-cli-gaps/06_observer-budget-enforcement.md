# Chunk 06: Observer — Wire Into dep-factory + Budget Enforcement

## Objective

Replace all observer stubs in `dep-factory.ts` with the real `CliObserverBridge`. Wire the `observerDeps` into `CliSkillExecutor`. Add an integration test proving budget enforcement actually trips the circuit breaker.

## Files

- **Edit**: `franken-orchestrator/src/cli/dep-factory.ts`
- **Edit**: `franken-orchestrator/package.json` (verify `@frankenbeast/observer` dependency)
- **Create**: `franken-orchestrator/test/cli/budget-enforcement.test.ts`
- **Read**: `franken-orchestrator/src/skills/cli-skill-executor.ts`

## Success Criteria

- [ ] `dep-factory.ts` imports `CliObserverBridge` instead of using `createStubObserver()` and `createStubObserverDeps()`
- [ ] `createCliDeps()` creates `new CliObserverBridge({ budgetLimitUsd: options.budget })`
- [ ] `CliObserverBridge` instance is used as `deps.observer` (IObserverModule)
- [ ] `observerBridge.observerDeps` is passed to `CliSkillExecutor` constructor (replacing `createStubObserverDeps() as never`)
- [ ] The `as never` cast on `CliSkillExecutor` observer param is removed
- [ ] `createStubObserver()` and `createStubObserverDeps()` functions are deleted from `dep-factory.ts`
- [ ] Integration test: create `CliObserverBridge` with `budgetLimitUsd: 0.01`, record tokens worth $0.02, verify `breaker.check()` returns `tripped: true`
- [ ] Integration test: create bridge with `budgetLimitUsd: 100`, record small usage, verify `tripped: false`
- [ ] `npm run build` succeeds (full build, not just typecheck)
- [ ] All existing tests still pass

## Verification Command

```bash
cd franken-orchestrator && npm run build && npx vitest run test/cli/budget-enforcement.test.ts && npx vitest run
```

## Hardening Requirements

- Keep the other stubs (`stubFirewall`, `stubMemory`, `stubPlanner`, etc.) — only observer stubs are replaced
- `CliDeps` interface must now include `observerBridge: CliObserverBridge` for use by session.ts (e.g., for the summary display to show real costs)
- Verify that `franken-orchestrator/package.json` has `@frankenbeast/observer` in dependencies — if it's only in devDependencies or missing, move/add it
- The `CliSkillExecutor` constructor's third param is typed as `ObserverDeps` — ensure the bridge's `observerDeps` property matches this type exactly (no `as never`)
- If `better-sqlite3` import fails (native module), the bridge should still work for token/cost/budget — only trace storage requires it
