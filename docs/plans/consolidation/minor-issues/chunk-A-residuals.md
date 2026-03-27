# Chunk A Residual Issues

Items remaining after the dep-factory migration (Chunk A).

---

## R1. ChatRuntimeResult missing providerContext and phase fields

**Source:** Phase 4.5 M1
**Status:** Open
**Severity:** Medium
**Context:** `ChatRuntimeCommsAdapter` maps `result.providerContext` and `result.phase` from ChatRuntimeResult, but these fields don't exist on the type yet. The adapter has `as unknown as Record<string, unknown>` casts.

**Fix:** Add `providerContext` and `phase` fields to `ChatRuntimeResult`, remove the casts.

**Affected files:**
- `packages/franken-orchestrator/src/chat/runtime.ts`
- `packages/franken-orchestrator/src/comms/core/chat-runtime-comms-adapter.ts`

---

## R2. SkillManager.loadForProvider() not implemented

**Source:** Phase 5 M2
**Status:** Open
**Severity:** Medium
**Context:** The skill loading spec calls for `loadForProvider()` that delegates to `ProviderSkillTranslator`. SkillManager has no such method. The translator exists as a standalone class.

**Fix:** Add `loadForProvider(provider: string)` to SkillManager, delegating to ProviderSkillTranslator.

---

## R3. ReflectionHeartbeatAdapter has no reflectionFn

**Source:** Phase 6 M1
**Status:** Open (partial)
**Severity:** Low
**Context:** `ReflectionHeartbeatAdapter` is wired as the heartbeat port, replacing the stub. But it's constructed without a `reflectionFn`, so `pulse()` returns empty results. The actual `ReflectionEvaluator` needs to be wired as the reflectionFn.

**Fix:** In `createBeastDeps()`, pass a `reflectionFn` that invokes `ReflectionEvaluator.evaluate()`.

---

## R4. AuditTrail not persisted at closure

**Source:** Phase 7 M1
**Status:** Open (partial)
**Severity:** Medium
**Context:** `AuditTrail` is created in `createBeastDeps()` and events are appended during provider switches. But `AuditTrailStore.save()` is never called — the trail is lost when the process exits.

**Fix:** In `dep-factory.ts` finalize function, call `AuditTrailStore.save(runId, auditTrail)`.

---

## R5. Old createCliDeps() not deleted

**Source:** Phase 8 M1
**Status:** Open (intentional)
**Severity:** Informational
**Context:** `createCliDeps()` was refactored to use `createBeastDeps()` internally (stubs replaced with real adapters). But the function itself, its CLI infrastructure (CliLlmAdapter, MartinLoop, session stores, etc.), and its callers remain unchanged. Full deletion requires extracting CLI infrastructure into a separate function.

**Why kept:** The CLI execution infrastructure (CliLlmAdapter, MartinLoop, GitBranchIsolator, CliSkillExecutor, PrCreator, session stores) has no equivalent in `createBeastDeps()`. These are CLI-specific concerns that don't belong in the generic deps factory.

**Fix (optional):** Split createCliDeps into `createCliInfrastructure()` (CLI-specific objects) + `createBeastDeps()` (module adapters). This is a cleanup, not a functional requirement.

---

## Summary

| ID | Severity | Resolution |
|----|----------|------------|
| R1 | Medium | Add fields to ChatRuntimeResult |
| R2 | Medium | Add loadForProvider to SkillManager |
| R3 | Low | Wire ReflectionEvaluator as reflectionFn |
| R4 | Medium | Call AuditTrailStore.save at closure |
| R5 | Info | Optional cleanup |

**Verdict:** Chunk A core objective achieved — all module stubs replaced with real consolidated adapters. 5 residual items tracked for follow-up.
