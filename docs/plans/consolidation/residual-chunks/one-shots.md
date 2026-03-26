# Residual One-Shots

Quick fixes that can each be done in a single PR. No dependencies on chunks unless noted.

Phase 1.1 (commsConfig pass-through) is resolved by Chunk A Task 9 — not listed here.

---

## O1: Delete standalone comms server files

**Source:** Phase 1.2
**Severity:** Informational

**Problem:** `server/app.ts` and `server/start-comms-server.ts` are redundant since comms routes are now served by the orchestrator's Hono server. `resolveCommsServerConfig()` is imported by one test.

**Fix:**
1. Move `resolveCommsServerConfig()` to `comms/config/comms-config.ts`
2. Update import in `tests/unit/comms/managed-config.test.ts`
3. Delete `src/comms/server/app.ts`
4. Delete `src/comms/server/start-comms-server.ts`
5. Update `src/comms/index.ts` re-exports (remove `startCommsServer`, `createCommsApp`)

**Files:**
- `packages/franken-orchestrator/src/comms/server/app.ts` (delete)
- `packages/franken-orchestrator/src/comms/server/start-comms-server.ts` (delete)
- `packages/franken-orchestrator/src/comms/config/comms-config.ts` (add function)
- `packages/franken-orchestrator/src/comms/index.ts` (update exports)
- `packages/franken-orchestrator/tests/unit/comms/managed-config.test.ts` (update import)

---

## O2: HITL approval integration test

**Source:** Phase 1.3
**Severity:** Low

**Problem:** No integration test for the full flow: Slack webhook → comms route → ChatGateway → orchestrator → governor approval.

**Fix:**
1. Create `tests/integration/comms/slack-hitl.test.ts`
2. Send mock Slack interaction payload through comms routes
3. Verify it reaches gateway's `handleAction()` and produces approval response

**Files:**
- Create: `packages/franken-orchestrator/tests/integration/comms/slack-hitl.test.ts`

---

## O3: Recovery checkpoint flush

**Source:** Phase 2 I5
**Severity:** Informational

**Problem:** `SqliteRecoveryMemory.checkpoint()` doesn't flush in-memory working memory to SQLite. Only `serialize()` does.

**Fix:**
1. Add `this.workingMemory.flushToDb()` call inside `SqliteRecoveryMemory.checkpoint()` (class is in `sqlite-brain.ts`)
2. Add test verifying checkpoint persists working memory state

**Files:**
- `packages/franken-brain/src/sqlite-brain.ts`
- `packages/franken-brain/tests/` (new or existing test)

---

## O4: Update PROGRESS.md

**Source:** Phase 2 I6
**Severity:** Informational

**Problem:** `docs/PROGRESS.md` is missing entries for Phases 2-8 of Architecture Consolidation.

**Fix:**
1. Add Phase 2 (Brain Rewrite) entry with PR numbers
2. Add Phase 3 (Provider Registry) entry
3. Add Phase 4 (Security Middleware) entry
4. Add Phase 4.5 (Comms Integration) entry
5. Add Phase 5 (Skill Loading) entry
6. Add Phase 6 (Reflection Critique) entry
7. Add Phase 7 (Observer Audit) entry
8. Add Phase 8 (Integration) entry
9. Update test count summary

**Files:**
- `docs/PROGRESS.md`
