# Chunk 1.4: Remove franken-heartbeat

**Phase:** 1 — Remove Dead Packages
**Depends on:** Phase 0 (clean main)
**Estimated size:** Medium (deletion + multiple integration point temporary pass-throughs)

---

## Context

`franken-heartbeat` provides three capabilities:
1. **Reflection** — LLM-based self-assessment ("am I on the right track?")
2. **Checkpointing** — periodic state snapshots for crash recovery
3. **Self-assessment** — periodic evaluation of execution progress

In the consolidated architecture:
- Reflection → becomes a critique evaluator in `franken-critique` (Phase 6)
- Checkpointing → absorbed into orchestrator via `SqliteBrain.recovery.checkpoint()` (Phase 2)
- Self-assessment → orchestrator config flag (Phase 8)

Important distinction: the orchestrator's existing file-based execution recovery (`ICheckpointStore` / `FileCheckpointStore`) already lives outside `franken-heartbeat` and should remain intact during Phase 1. Phase 2 adds provider-agnostic brain recovery memory; it does not restore basic task checkpointing from zero.

This is the most complex deletion because heartbeat has multiple integration points with the orchestrator's Beast Loop.

## What to Do

### 1. Delete the package directory

```bash
rm -rf packages/franken-heartbeat/
```

### 2. Remove workspace references

- **`package.json` (root):** Remove `packages/franken-heartbeat` from `workspaces`
- **`turbo.json`:** Remove pipeline entries
- **`tsconfig.json` (root):** Remove from `references`

### 3. Find and fix all imports

```bash
grep -r "@frankenbeast/heartbeat" packages/ --include="*.ts" --include="*.tsx"
grep -r "franken-heartbeat" packages/ --include="*.ts" --include="*.tsx" --include="*.json"
```

**Key locations in the orchestrator:**

1. **Beast Loop closure phase** — calls heartbeat for reflection/self-assessment at the end of execution. Replace with no-op:
   ```typescript
   // TODO: Phase 6 — ReflectionEvaluator in franken-critique replaces heartbeat reflection
   // TODO: Phase 2 — SqliteBrain.recovery.checkpoint() replaces heartbeat checkpointing
   ```

2. **`dep-factory.ts`** — dynamic import for heartbeat module. Remove the import, leave TODO.

3. **Any checkpointing calls** — the orchestrator may call heartbeat's checkpoint method periodically. Replace with:
   ```typescript
   // TODO: Phase 2 — brain.recovery.checkpoint(state) replaces this
   ```
   Do not remove the existing `ICheckpointStore` / `FileCheckpointStore` path used for task execution recovery.

### 4. Handle the Zod version split

`franken-heartbeat` uses `zod/v4` while `franken-critique` uses `zod 3.24` (6 Type Mismatches, item #6). Deleting heartbeat resolves this split — after removal, the monorepo should have a single Zod version. Verify:

```bash
grep -r "from 'zod'" packages/ --include="*.ts" | grep -v node_modules
```

### 5. Run verification

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Known References

- `packages/franken-orchestrator/src/cli/dep-factory.ts` — dynamic heartbeat import
- `packages/franken-orchestrator/src/` — Beast Loop closure phase calls
- `packages/franken-orchestrator/package.json` — `@frankenbeast/heartbeat` dependency
- `packages/franken-types/src/` — may have heartbeat-related type exports (e.g., `IReflectionResult`)

## Files

- **Delete:** `packages/franken-heartbeat/` (entire directory)
- **Modify:** Root `package.json`, root `tsconfig.json`
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts` — remove dynamic import
- **Modify:** Any Beast Loop phase files that call heartbeat methods
- **Modify:** `packages/franken-orchestrator/package.json` — remove dependency
- **Possibly modify:** `packages/franken-types/` — remove heartbeat-specific type exports if they exist

## Exit Criteria

- `packages/franken-heartbeat/` does not exist
- `grep -r "@frankenbeast/heartbeat" packages/` returns zero results
- Beast Loop still executes without errors (heartbeat calls replaced with no-ops)
- Existing `FileCheckpointStore`-based execution recovery still works
- Zod version split is resolved (single Zod version across monorepo)
- `npm install && npm run build && npm run typecheck` succeeds
