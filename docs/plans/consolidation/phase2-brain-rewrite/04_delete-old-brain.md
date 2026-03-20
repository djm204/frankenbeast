# Chunk 2.4: Delete Old Brain Code

**Phase:** 2 — Rewrite franken-brain
**Depends on:** Chunks 2.2 + 2.3 (new implementation complete)
**Estimated size:** Small (deletion + package.json cleanup)

---

## Purpose

Remove all existing franken-brain implementation files that are not part of the new design. The old brain is overengineered — the new `SqliteBrain` is ~300 lines and covers all required functionality.

## What to Do

### 1. Inventory existing files

Before deleting, list everything in the current brain:
```bash
find packages/franken-brain/src/ -name "*.ts" | sort
find packages/franken-brain/tests/ -name "*.ts" | sort
```

### 2. Map old tests to new coverage

For each old test file, verify that the equivalent behavior is covered by the new tests:
- Working memory storage → `sqlite-brain.test.ts` working memory suite
- Episodic recording → `sqlite-brain.test.ts` episodic memory suite
- Episodic recall → `episodic-recall.test.ts`
- Checkpoint/recovery → `sqlite-brain.test.ts` recovery memory suite
- Serialization → `brain-serialize-hydrate.test.ts`

If any old test covers behavior NOT covered by new tests, either:
- Add the missing test to the new test suite
- Document why the behavior was intentionally dropped

### 3. Delete old files

Remove all source files except the new implementation:
- Keep: `src/sqlite-brain.ts`, `src/index.ts`
- Keep: `tests/unit/sqlite-brain.test.ts`, `tests/unit/episodic-recall.test.ts`, `tests/integration/brain-serialize-hydrate.test.ts`
- Delete: everything else in `src/` and `tests/`

### 4. Clean up package.json

`packages/franken-brain/package.json` should have:
```json
{
  "dependencies": {
    "better-sqlite3": "^11.x",
    "@frankenbeast/types": "workspace:*"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.x",
    "vitest": "^2.x",
    "typescript": "^5.x"
  }
}
```

Remove any other dependencies from the old implementation (there may be LLM client deps, event emitter deps, etc. that are no longer needed).

### 5. Update exports

`packages/franken-brain/src/index.ts`:
```typescript
export { SqliteBrain } from './sqlite-brain.js';
```

No other exports. The types come from `@frankenbeast/types`.

### 6. Verify

```bash
npx turbo run test --filter=franken-brain
npx turbo run build --filter=franken-brain
npx turbo run typecheck --filter=franken-brain
```

Then full monorepo:
```bash
npm test
npm run build
npm run typecheck
```

Check that no other package imports anything from `franken-brain` that no longer exists.

## Files

- **Delete:** All old source files in `packages/franken-brain/src/` except `sqlite-brain.ts` and `index.ts`
- **Delete:** All old test files in `packages/franken-brain/tests/` except the new test files
- **Modify:** `packages/franken-brain/package.json` — strip unnecessary dependencies
- **Modify:** `packages/franken-brain/src/index.ts` — export only `SqliteBrain`

## Exit Criteria

- `packages/franken-brain/src/` contains only `sqlite-brain.ts` and `index.ts`
- No old implementation code remains
- `package.json` dependencies are only `better-sqlite3` + `@frankenbeast/types`
- All brain tests pass
- No other package in the monorepo breaks (no missing imports from brain)
- Full `npm test && npm run build && npm run typecheck` succeeds
- Brain source is ~300 lines (excluding tests)
