# Chunk 03: CLI LLM Adapter — Wiring

## Objective

Wire `CliLlmAdapter` into `dep-factory.ts` and `session.ts`, replacing the broken `deps.cliExecutor as never` cast. After this chunk, `frankenbeast plan --design-doc <path>` should no longer crash.

## Files

- **Edit**: `franken-orchestrator/src/cli/dep-factory.ts`
- **Edit**: `franken-orchestrator/src/cli/session.ts`
- **Read**: `franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- **Read**: `franken-orchestrator/src/adapters/adapter-llm-client.ts`
- **Create**: `franken-orchestrator/test/cli/session-plan.test.ts`

## Success Criteria

- [ ] `dep-factory.ts` creates a `CliLlmAdapter` instance using `options.provider` and `paths.root`
- [ ] `CliDeps` interface now includes `cliLlmAdapter: CliLlmAdapter`
- [ ] `createCliDeps()` returns the adapter in the deps object
- [ ] `session.ts` `runInterview()` uses `new AdapterLlmClient(deps.cliLlmAdapter)` instead of `new AdapterLlmClient(deps.cliExecutor as never)`
- [ ] `session.ts` `runPlan()` uses `new AdapterLlmClient(deps.cliLlmAdapter)` instead of `new AdapterLlmClient(deps.cliExecutor as never)`
- [ ] All `as never` casts related to `AdapterLlmClient` are removed from `session.ts`
- [ ] Test verifies that `createCliDeps()` returns a `cliLlmAdapter` with `transformRequest` method
- [ ] Test verifies that `Session.runPlan()` calls the adapter (mock the spawn to return valid JSON chunks)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/cli/session-plan.test.ts && npm run build
```

## Hardening Requirements

- Remove ALL `as never` casts in `session.ts` that were hiding the type mismatch
- The `CliLlmAdapter` in `dep-factory.ts` should use the same `workingDir` as `GitBranchIsolator`
- Do NOT change the `CliSkillExecutor` construction — it still uses `RalphLoop` for chunk execution
- The `cliLlmAdapter` is a SEPARATE concern from `cliExecutor` — one is for single-shot LLM calls (planning), the other is for multi-iteration chunk execution
- Also fix the `InterviewLoop` constructor call in `runInterview()` — it currently uses `capturingGraphBuilder as never` which should be typed properly
