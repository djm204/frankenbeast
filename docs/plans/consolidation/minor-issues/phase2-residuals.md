# Phase 2 Residual Issues

Minor items identified during Phase 2 (Brain Rewrite) final scrutinization that don't block the phase but should be tracked.

---

## M1. Legacy code retained in franken-brain

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The Phase 2.4 spec says "src/ contains only sqlite-brain.ts and index.ts." In practice, `src/episodic/` (EpisodicMemoryStore, IEpisodicStore, migrations) and `src/types/` (memory.ts, ids.ts, token-budget.ts) were retained because `franken-orchestrator/src/dep-factory.ts` imports `EpisodicMemoryStore` at runtime.

**Why kept:** Deleting these would break the orchestrator. Phase 8 (dep-factory rewiring) explicitly handles switching orchestrator imports to SqliteBrain.

**Fix:** Remove in Phase 8 when dep-factory.ts is rewired to use `SqliteBrain`.

**Affected files:**
- `packages/franken-brain/src/episodic/`
- `packages/franken-brain/src/types/`
- `packages/franken-brain/src/index.ts` (legacy re-exports)

---

## M2. Extra dependencies retained (ulid, zod v4)

**Status:** Open (intentional)
**Severity:** Medium
**Context:** `ulid` and `zod@^4.3.6` remain in franken-brain's package.json solely because the legacy episodic/types code uses them. SqliteBrain itself only depends on `better-sqlite3` and `@franken/types`.

**Fix:** Remove when legacy code is deleted in Phase 8.

**Affected files:**
- `packages/franken-brain/package.json`

---

## I1. serialize() hardcodes empty metadata

**Status:** Open (by design)
**Severity:** Informational
**Context:** `SqliteBrain.serialize()` returns `metadata: { lastProvider: '', switchReason: '', totalTokensUsed: 0 }`. The brain itself doesn't know which LLM provider is active — the orchestrator populates these fields before handing off the snapshot.

**Fix:** None needed. The orchestrator will set metadata pre-handoff. If this becomes awkward, a `serialize(meta: Partial<BrainSnapshot['metadata']>)` overload could be added.

---

## I2. Episodic recall capped at 100 events on serialize

**Status:** Open
**Severity:** Informational
**Context:** `serialize()` calls `this.episodic.recent(100)`, so snapshots only carry the 100 most recent episodic events. This is undocumented in the spec. For long-running agents with hundreds of events, older episodes will be lost during provider handoff.

**Fix (optional):** Make the cap configurable via constructor options, or document the limit in ADR-031. Low priority — 100 events is generous for typical runs.

---

## I3. No `Symbol.dispose` / `using` support on SqliteBrain

**Status:** Open
**Severity:** Informational
**Context:** SqliteBrain has a `close()` method but doesn't implement `Symbol.dispose`. TypeScript 5.2+ supports `using brain = new SqliteBrain()` for automatic cleanup. The spec doesn't require it.

**Fix (optional):** Add `[Symbol.dispose](): void { this.close(); }` for ergonomic resource management. Trivial addition when desired.

---

## I4. flushToDb() uses DELETE-then-INSERT pattern

**Status:** Open
**Severity:** Informational
**Context:** `SqliteWorkingMemory.flushToDb()` does `DELETE FROM working_memory` then re-inserts all entries, wrapped in a transaction. This is safe and correct for the expected data volumes (working memory is small), but less efficient than an UPSERT for large key sets.

**Fix:** None needed. Working memory is typically <50 keys. If perf becomes an issue, switch to `INSERT OR REPLACE`.

---

## S1. Episodic event IDs not stable across serialize/hydrate round-trips

**Status:** Open
**Severity:** Suggestion
**Context:** When events are serialized and hydrated into a new database, SQLite assigns new autoincrement IDs. The original `id` field in the event object is not preserved. This is by design (IDs are database-local), but could be surprising if code relies on stable event identity across provider switches.

**Fix (optional):** If stable IDs are needed, add a `uuid` field to EpisodicEvent. Low priority — no current consumer relies on cross-database ID stability.

---

## I5. Recovery checkpoint does not flush working memory to SQLite

**Status:** Open
**Severity:** Informational
**Context:** The spec states that `checkpoint()` (triggered by recovery) should flush the in-memory working memory Map to the SQLite `working_memory` table. In the implementation, `SqliteRecoveryMemory.checkpoint()` only inserts a checkpoint row — it does not call `flushToDb()` on working memory. The flush happens only in `SqliteBrain.serialize()`. If `brain.recovery.checkpoint(state)` is called without a subsequent `serialize()`, the `working_memory` table won't reflect current in-memory state.

**Risk:** Low in practice — `serialize()` is the primary handoff path and always flushes. But any code path that relies on recovery checkpoints alone (without serialize) would see stale working memory in SQLite.

**Fix:** Add a `flushToDb()` call inside `SqliteRecoveryMemory.checkpoint()`, or document that callers must call `serialize()` after checkpoint if SQLite consistency is needed.

---

## I6. PROGRESS.md missing Phase 2 Brain Rewrite entry

**Status:** Open
**Severity:** Informational
**Context:** `docs/PROGRESS.md` has no entry for the Phase 2 Brain Rewrite under Architecture Consolidation. Only the original pre-consolidation Phase 2 (LLM-Agnostic Adapter Layer, PRs 15–23) is tracked. The Architecture Consolidation section covers Phase 1 but not Phase 2 (PRs #246–#249).

**Fix:** Add Phase 2 Brain Rewrite entries to PROGRESS.md under the Architecture Consolidation section.

---

## S2. No test verifying flushToDb() actually persists to SQLite

**Status:** Open
**Severity:** Suggestion
**Context:** The serialize/hydrate integration tests implicitly verify persistence (since hydrate reads from the database), but there's no unit test that calls `flushToDb()` then queries `working_memory` table directly to confirm rows exist.

**Fix (optional):** Add a targeted test in `sqlite-brain.test.ts`. Low priority — the integration tests already cover the critical path.

---

## Summary

| ID | Severity | Blocks Phase 2? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Phase 8 |
| M2 | Medium | No | Phase 8 |
| I1 | Info | No | By design |
| I2 | Info | No | Optional config |
| I3 | Info | No | Optional enhancement |
| I4 | Info | No | Acceptable |
| I5 | Info | No | Flush in checkpoint or document |
| I6 | Info | No | Update PROGRESS.md |
| S1 | Suggestion | No | Optional UUID field |
| S2 | Suggestion | No | Optional test |

**Verdict:** Phase 2 is complete. All medium items are tracked for Phase 8. No blockers.
