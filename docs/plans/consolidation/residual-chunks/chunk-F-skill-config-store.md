# Chunk F: SkillConfigStore

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement persistent skill toggle state so enabled/disabled skills survive restarts.

**Architecture:** `SkillConfigStore` reads/writes `.frankenbeast/config.json`. Precedence: run config `skills:` field > persisted defaults > empty. SkillManager constructor accepts an optional `SkillConfigStore` and reads initial enabled set from it.

**Tech Stack:** TypeScript, Vitest, Node.js fs

**Resolves:** Phase 5 M4
**Sequence after:** Chunk A (both modify `create-beast-deps.ts` — file-level conflict risk)

---

## File Map

### Create
- `packages/franken-orchestrator/src/skills/skill-config-store.ts`
- `packages/franken-orchestrator/tests/unit/skills/skill-config-store.test.ts`

### Modify
- `packages/franken-orchestrator/src/skills/skill-manager.ts` — Accept optional `SkillConfigStore`, read initial state, persist on toggle
- `packages/franken-orchestrator/src/cli/create-beast-deps.ts` — Wire SkillConfigStore into SkillManager construction

---

## Tasks

### Task 1: SkillConfigStore

**Files:**
- Create: `src/skills/skill-config-store.ts`
- Test: `tests/unit/skills/skill-config-store.test.ts`

- [ ] **Step 1:** Write failing test — `store.getEnabledSkills()` returns empty set when no config file exists
- [ ] **Step 2:** Implement `SkillConfigStore` with constructor taking config dir path
- [ ] **Step 3:** Write failing test — `store.save(enabledSkills)` persists to `.frankenbeast/config.json`
- [ ] **Step 4:** Implement `save()` — JSON write with `{ skills: { enabled: [...] } }` schema
- [ ] **Step 5:** Write failing test — `store.getEnabledSkills()` reads from persisted file
- [ ] **Step 6:** Implement `getEnabledSkills()` — JSON read, return `Set<string>`
- [ ] **Step 7:** Write test — handles corrupt/invalid JSON gracefully (returns empty set)
- [ ] **Step 8:** Implement graceful fallback
- [ ] **Step 9:** Commit

### Task 2: Wire into SkillManager

**Files:**
- Modify: `src/skills/skill-manager.ts`
- Test: existing skill-manager tests

- [ ] **Step 1:** Write failing test — SkillManager with store reads initial enabled set on construction
- [ ] **Step 2:** Add optional `configStore?: SkillConfigStore` to SkillManager constructor
- [ ] **Step 3:** On construction, merge store defaults with constructor-provided set
- [ ] **Step 4:** Write failing test — `enable()` and `disable()` persist via store
- [ ] **Step 5:** Call `store.save()` in `enable()` and `disable()` methods
- [ ] **Step 6:** Run tests, commit

### Task 3: Wire into createBeastDeps

**Files:**
- Modify: `src/cli/create-beast-deps.ts`

- [ ] **Step 1:** Create `SkillConfigStore` with project root path
- [ ] **Step 2:** Pass to `SkillManager` constructor
- [ ] **Step 3:** Run tests, commit

### Task 4: Precedence test

- [ ] **Step 1:** Write test — run config `skills:` overrides persisted defaults
- [ ] **Step 2:** Verify: explicit run config > persisted store > empty
- [ ] **Step 3:** Commit
