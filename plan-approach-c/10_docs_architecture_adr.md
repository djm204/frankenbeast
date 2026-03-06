# Chunk 10: Documentation — ARCHITECTURE.md + ADR-008

## Objective

Update `docs/ARCHITECTURE.md` with the full Approach C pipeline and create ADR-008 documenting the design decisions.

## Files

- **Modify**: `docs/ARCHITECTURE.md` — add Approach C pipeline section with Mermaid diagrams
- **Create**: `docs/adr/008-approach-c-full-pipeline.md` — ADR for the full pipeline decisions

## Key Reference Files

- `docs/ARCHITECTURE.md` — existing architecture documentation
- `docs/adr/007-cli-skill-execution-type.md` — ADR format precedent
- `docs/plans/2026-03-05-approach-c-full-pipeline-design.md` — design doc to reference

## ARCHITECTURE.md Updates

Add a new section "### Full Pipeline (Approach C)" covering:

1. **Three input modes** — chunks, design-doc, interview
2. **Mermaid sequence diagram** showing the full flow:
   - Input mode selection → GraphBuilder → PlanGraph
   - BeastLoop phases: ingestion → planning → execution → closure
   - Checkpoint writes at each commit
   - PR creation in closure
3. **Component table** — new components with file locations and responsibilities
4. **Data flow diagram** — how `userInput` flows through all phases to PR

## ADR-008 Content

- **Title**: ADR-008: Full Pipeline — Idea to PR
- **Status**: Accepted
- **Context**: Approach A provided CLI skill primitives; build-runner still reimplemented logic; no path from idea to PR without human-written artifacts
- **Decision**: Three input modes converging to PlanGraph; per-commit checkpoints; PR creation in closure; build-runner becomes thin CLI shell
- **Consequences**:
  - Positive: single execution path, crash recovery, full automation possible
  - Negative: LLM decomposition quality depends on prompt engineering, interview mode adds interactive complexity

## Success Criteria

- [ ] `ARCHITECTURE.md` has new "Full Pipeline (Approach C)" section
- [ ] Mermaid sequence diagram shows all three input modes converging
- [ ] Mermaid diagram shows BeastLoop phases with checkpoint + PR
- [ ] Component table lists all new components from chunks 01-08
- [ ] ADR-008 follows existing format (Title, Status, Context, Decision, Consequences)
- [ ] ADR-008 references the design doc
- [ ] Existing ARCHITECTURE.md content preserved (only additions)
- [ ] Full test suite still passes: `cd franken-orchestrator && npx vitest run`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

- Do NOT delete or rewrite existing ARCHITECTURE.md sections — only add
- ADR-008 status must be "Accepted"
- Mermaid diagrams must use valid syntax (sequenceDiagram or flowchart)
- Reference design doc path: `docs/plans/2026-03-05-approach-c-full-pipeline-design.md`
- Reference ADR-007 as predecessor
- No code changes in this chunk — documentation only
