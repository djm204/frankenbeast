# Chunk 05: Wire GraphBuilder into BeastLoop Planning Phase

## Objective

Connect `ChunkFileGraphBuilder` (and future GraphBuilder implementations) into the orchestrator's planning phase so that `BeastLoop.run()` can accept a `GraphBuilder` and produce a `PlanGraph` from chunk files.

## Files

- **Modify**: `franken-orchestrator/src/phases/planning.ts` — support `GraphBuilder` as an alternative to `IPlannerModule`
- **Modify**: `franken-orchestrator/src/deps.ts` — add optional `graphBuilder?: GraphBuilder` to `BeastLoopDeps`
- **Modify**: `franken-orchestrator/src/beast-loop.ts` — pass `graphBuilder` to `runPlanning()`
- **Create**: `franken-orchestrator/tests/unit/planning-graph-builder.test.ts`

## Key Reference Files

- `franken-orchestrator/src/phases/planning.ts` — existing `runPlanning()` function
- `franken-orchestrator/src/deps.ts` — `BeastLoopDeps`, `IPlannerModule`
- `franken-orchestrator/src/beast-loop.ts` — `BeastLoop.run()` phase calls
- `franken-planner/src/planners/types.ts` — `GraphBuilder` interface
- `franken-orchestrator/src/planning/chunk-file-graph-builder.ts` — from chunk 02

## Design

The planning phase currently calls `planner.createPlan(intent)`. When a `GraphBuilder` is provided, it should be used instead:

```typescript
// In runPlanning():
if (graphBuilder) {
  // Use GraphBuilder directly — bypasses planner+critique loop
  ctx.plan = await graphBuilder.build({
    goal: ctx.sanitizedIntent.goal,
    strategy: ctx.sanitizedIntent.strategy,
    context: ctx.sanitizedIntent.context,
  });
  return;
}
// Existing planner+critique path unchanged
```

When `graphBuilder` is provided, the critique loop is skipped — chunk files are human-authored and pre-validated. The LlmGraphBuilder (chunk 07) will re-enable critique.

## Success Criteria

- [ ] `BeastLoopDeps` has optional `graphBuilder?: GraphBuilder`
- [ ] `runPlanning()` accepts optional `GraphBuilder` parameter
- [ ] When `graphBuilder` is provided, it produces the `PlanGraph` directly (no planner/critique)
- [ ] When `graphBuilder` is NOT provided, existing planner+critique path works unchanged
- [ ] `BeastLoop.run()` passes `graphBuilder` to `runPlanning()`
- [ ] `ctx.plan` is populated with the `PlanGraph` from `graphBuilder.build()`
- [ ] Test: ChunkFileGraphBuilder → runPlanning → ctx.plan has correct tasks
- [ ] Existing planning tests still pass
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run && npx tsc --noEmit`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

- `graphBuilder` is optional — existing code paths must not break
- Do NOT remove the planner+critique path — it's still used when no graphBuilder is provided
- The `GraphBuilder` interface type should be imported from a local definition or `@franken/types` — do NOT add a direct dependency on `franken-planner`
- `makeDeps()` in test helpers should NOT include `graphBuilder` by default
- Use `.js` extensions in all import paths (NodeNext)
- Do NOT modify the existing `IPlannerModule` interface
