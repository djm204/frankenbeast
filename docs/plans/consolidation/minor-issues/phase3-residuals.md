# Phase 3 Residual Issues

Minor items identified during Phase 3 (Provider Registry + Adapters) review that don't block the phase but should be tracked.

---

## M1. New ProviderRegistry not wired into orchestrator runtime

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The new `ProviderRegistry` in `src/providers/provider-registry.ts` is only imported by provider tests. The runtime in `src/cli/dep-factory.ts` still uses the older CLI-only `ProviderRegistry` from `src/skills/providers/cli-provider.ts`. This means the new multi-provider failover path is not exercised in production.

**Why kept:** No Phase 3 chunk includes dep-factory modifications. The Phase 3 spec builds the capability; Phase 8 (dep-factory rewiring) wires it into the runtime. This is the same pattern as Phase 2's M1 (legacy brain code retained until dep-factory is rewired).

**Fix:** Phase 8 — replace the old provider dispatch in `dep-factory.ts` with the new `ProviderRegistry`, remove old `src/skills/providers/` code.

**Affected files:**
- `packages/franken-orchestrator/src/cli/dep-factory.ts`
- `packages/franken-orchestrator/src/skills/providers/cli-provider.ts` (to be replaced)
- `packages/franken-orchestrator/src/providers/provider-registry.ts` (to be consumed)

---

## M2. Cross-provider token aggregation not wired to BrainSnapshot or BudgetTrigger

**Status:** Open (intentional)
**Severity:** Medium
**Context:** `ProviderRegistry.getTokenUsage()` returns aggregated token counts, but no production code calls it. `BrainSnapshot.metadata.totalTokensUsed` is still hardcoded to 0 in `SqliteBrain.serialize()`. The Governor's `BudgetTrigger` does not read cumulative usage from the aggregator.

**Why kept:** Chunk 3.10's spec explicitly states: *"The dep-factory (Chunk 8.1) passes a callback that reads from the aggregator."* The aggregator is built and tested; the wiring is a Phase 8 concern. `SqliteBrain.serialize()` was noted in Phase 2 residual I1 as hardcoding empty metadata — the orchestrator is responsible for populating these fields pre-handoff.

**Fix:** Phase 8 — dep-factory wires `registry.getTokenUsage().totalTokens` into BudgetTrigger callback and populates `BrainSnapshot.metadata.totalTokensUsed` from the aggregator during serialization.

**Affected files:**
- `packages/franken-orchestrator/src/cli/dep-factory.ts`
- `packages/franken-brain/src/sqlite-brain.ts` (or orchestrator-level serialize wrapper)

---

## I1. Claude CLI isAvailable() only checks --version, not auth validity

**Status:** Open
**Severity:** Informational
**Context:** The Phase 3.3 spec says `isAvailable()` should check "binary exists" and "auth is valid." The implementation only spawns `claude --version` (binary check). A more thorough check would verify the API key or CLI login is valid, but this would require an API call or a more expensive CLI invocation.

**Fix (optional):** Add a lightweight auth check (e.g., `claude auth status` if available) as a second step in `isAvailable()`. Low priority — the registry's failover logic handles auth failures gracefully at execute time.

**Affected files:**
- `packages/franken-orchestrator/src/providers/claude-cli-adapter.ts`

---

## Summary

| ID | Severity | Blocks Phase 3? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Phase 8 |
| M2 | Medium | No | Phase 8 |
| I1 | Info | No | Optional enhancement |

**Verdict:** Phase 3 is complete. All medium items are tracked for Phase 8. No blockers.
