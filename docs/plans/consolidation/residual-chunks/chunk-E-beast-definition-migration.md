# Chunk E: Beast Definition Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert existing beast definitions (martin-loop, chunk-plan, design-interview) to `skills/<name>/` directories with `mcp.json` + `context.md`.

**Architecture:** Beast definitions are currently TypeScript objects in `src/beasts/definitions/`. The skill system expects `skills/<name>/mcp.json` + optional `context.md`. This is a manual migration that creates skill directory equivalents while keeping the existing beast definitions operational.

**Tech Stack:** TypeScript, JSON

**Resolves:** Phase 5 M3

---

## Current Beast Definitions

Located in `packages/franken-orchestrator/src/beasts/definitions/`:

1. **design-interview** — Spawns `frankenbeast interview --goal <str> --output <path>`
2. **chunk-plan** — Spawns `frankenbeast plan --design-doc <file> --output-dir <dir>`
3. **martin-loop** — Spawns `frankenbeast run --provider <name> --plan-dir <dir>`

Each sets `env.FRANKENBEAST_SPAWNED = '1'` and has interview prompts for user input.

---

## Tasks

### Task 1: Create skill directories

- [ ] **Step 1:** Create `skills/design-interview/mcp.json` with the tool definition matching the beast's spawn command
- [ ] **Step 2:** Create `skills/design-interview/context.md` with the beast's description and usage
- [ ] **Step 3:** Create `skills/chunk-plan/mcp.json`
- [ ] **Step 4:** Create `skills/chunk-plan/context.md`
- [ ] **Step 5:** Create `skills/martin-loop/mcp.json`
- [ ] **Step 6:** Create `skills/martin-loop/context.md`
- [ ] **Step 7:** Commit

### Task 2: Verify skills are discoverable

- [ ] **Step 1:** Write test — SkillManager discovers all 3 skills from the skills directory
- [ ] **Step 2:** Verify `SkillManager.list()` returns correct info for each
- [ ] **Step 3:** Commit

### Task 3: Document coexistence

- [ ] **Step 1:** Add note to beast definitions that skill equivalents exist
- [ ] **Step 2:** Document migration path in context.md files
- [ ] **Step 3:** Commit

---

## Notes

- Beast definitions remain operational — this is additive, not a replacement
- The skill directories enable the new skill management UI (Chunk D) to discover these capabilities
- Full beast→skill replacement (removing beast definitions) is a future concern
