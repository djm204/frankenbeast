# Chunk 08: Documentation & Cleanup

## Objective

Update ARCHITECTURE.md, PROGRESS.md, and README.md to reflect that the execution gap is closed. Remove the "Known Limitations" about stub-level execution and `--dry-run` requirement. Update the Beast Loop doc comment in beast-loop.ts. This is the final chunk — the framework is integrated end-to-end.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunks 01-07 must be complete (all code + tests done)
- `docs/ARCHITECTURE.md` — needs Phase 3 execution description updated
- `docs/PROGRESS.md` — needs new Phase 8 entry for execution workflow
- `README.md` — needs Known Limitations updated
- `franken-orchestrator/src/beast-loop.ts` — doc comment says "8 modules", should reflect MCP

## Success Criteria

- [ ] `docs/ARCHITECTURE.md` Phase 3 description mentions skill execution (LLM/function/MCP dispatch)
- [ ] `docs/ARCHITECTURE.md` Port Interfaces table includes `ISkillsModule.execute` note
- [ ] `docs/PROGRESS.md` has new Phase 8 section documenting the executeTask work
- [ ] `README.md` Known Limitations section updated: remove stub-level execution, remove `--dry-run` requirement
- [ ] `README.md` Known Limitations: add new limitation about concrete skill implementations being in-memory only
- [ ] `beast-loop.ts` doc comment updated to mention MCP and skill execution
- [ ] All tests still pass: `npm run test:all` (or `npm test` + `cd franken-orchestrator && npx vitest run`)
- [ ] Build still compiles: `cd franken-orchestrator && npx tsc --noEmit`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run
```

Expected: Clean compile, all tests pass.

## Hardening Requirements

- Do NOT remove existing content from PROGRESS.md — only add new Phase 8 section
- Do NOT change any code in this chunk — documentation only
- ARCHITECTURE.md changes must be factual (match actual implementation, not aspirational)
- Update the test count in PROGRESS.md to reflect the new tests added in Chunks 04-07
- README Known Limitations should be honest: skill execution works but concrete implementations are in-memory stubs (no real LLM calls in the default setup)

## Exact Changes

### docs/ARCHITECTURE.md

1. In the Beast Loop section (lines 33-36), update Phase 3 description:
   - OLD: "Tasks run in topological order with HITL governor gates; MCP Registry provides external tool execution via connected MCP servers"
   - NEW: "Tasks run in topological order with HITL governor gates. Skills execute via hybrid dispatch (LLM/function/MCP). MCP Registry provides external tool execution via connected MCP servers. Dependency outputs thread between tasks."

### docs/PROGRESS.md

Add after Phase 7:

```markdown
## Phase 8: Execute Task Workflow

- [x] **PR-43**: Types & interfaces — SkillInput, SkillResult, IMcpModule, extended ISkillsModule
- [x] **PR-44**: Test helpers — makeSkills() + InMemorySkills with execute()
- [x] **PR-45**: Execution logic — real skill dispatch, dependency output threading, failure traces
- [x] **PR-46**: Unit tests — 9 new execution tests covering skill dispatch, errors, threading
- [x] **PR-47**: Beast Loop wiring — IMcpModule passed to runExecution
- [x] **PR-48**: E2E tests — output verification, dependency threading, failure propagation
- [x] **PR-49**: Root integration tests — cross-module execution verification
- [x] **PR-50**: Documentation — updated ARCHITECTURE.md, README.md, PROGRESS.md
```

### README.md Known Limitations

Replace:
```markdown
- **Orchestrator execution is stub-level** — `executeTask()` records success without invoking a real skill. Requires concrete skill implementations to wire.
- **CLI requires `--dry-run`** — no concrete module implementations wired for live execution yet.
```

With:
```markdown
- **Skill implementations are in-memory** — the skill execution pipeline is wired end-to-end, but concrete skill handlers (LLM prompt templates, function implementations) use in-memory stubs. Real implementations require provider-specific skill definitions.
- **MCP integration is optional** — MCP tool execution works when servers are configured, but is not required for basic operation.
```
