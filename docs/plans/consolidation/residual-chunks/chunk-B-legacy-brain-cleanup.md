# Chunk B: Legacy Brain Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete legacy episodic memory code and dependencies from franken-brain now that the dep-factory no longer imports them.

**Architecture:** Phase 2 rewrote franken-brain around `SqliteBrain`. The old `episodic/` and `types/` directories were retained because `dep-factory.ts` imported `EpisodicMemoryStore`. After Chunk A migrates to `createBeastDeps()`, these are dead code.

**Tech Stack:** TypeScript, Vitest, better-sqlite3

**Resolves:** Phase 2 M1, Phase 2 M2

**Depends on:** Chunk A (dep-factory migration)

---

## File Map

### Delete
- `packages/franken-brain/src/episodic/` — entire directory (episodic-memory-store.ts, episodic-store-interface.ts, index.ts, migrations)
- `packages/franken-brain/src/types/` — entire directory (memory.ts, ids.ts, token-budget.ts, index.ts)

### Modify
- `packages/franken-brain/src/index.ts` — Remove legacy re-exports (lines 4-18)
- `packages/franken-brain/package.json` — Remove `ulid`, `zod` dependencies

### Test
- Verify `npm run build --filter=franken-brain` succeeds
- Verify `npm test --filter=franken-brain` passes
- Verify no other package imports deleted exports

---

## Tasks

### Task 1: Verify no remaining consumers

- [ ] **Step 1:** Grep codebase for imports of `EpisodicMemoryStore`, `IEpisodicStore`, `TokenBudget`, `generateId`, `parseMemoryEntry`, `parseMemoryStatus`, `MemoryStatus`, `MemoryMetadata`, `WorkingTurn`, `EpisodicTrace`, `SemanticChunk`, `MemoryEntry`
- [ ] **Step 2:** Confirm all references are in files deleted by Chunk A or in franken-brain itself
- [ ] **Step 3:** If external references remain, update them first

### Task 2: Delete legacy code

- [ ] **Step 1:** Delete `packages/franken-brain/src/episodic/` directory
- [ ] **Step 2:** Delete `packages/franken-brain/src/types/` directory
- [ ] **Step 3:** Clean up `packages/franken-brain/src/index.ts` to only export `SqliteBrain`
- [ ] **Step 4:** Commit

### Task 3: Remove dead dependencies

- [ ] **Step 1:** Remove `ulid` from `package.json`
- [ ] **Step 2:** Remove `zod` from `package.json`
- [ ] **Step 3:** Run `npm install` to update lockfile
- [ ] **Step 4:** Commit

### Task 4: Verify

- [ ] **Step 1:** Run `npx turbo run build --filter=franken-brain`
- [ ] **Step 2:** Run `npx turbo run test --filter=franken-brain`
- [ ] **Step 3:** Run `npx turbo run typecheck`
- [ ] **Step 4:** Run `npm test` (full suite)
- [ ] **Step 5:** Commit if any fixups needed
