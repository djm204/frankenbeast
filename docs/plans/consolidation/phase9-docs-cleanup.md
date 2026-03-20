# Phase 9: Documentation + Cleanup

**Goal:** All documentation reflects the new 8-package architecture. No stale references remain. Final green CI.

**Dependencies:** Phase 8

**Why this matters:** The consolidation changes every package boundary, interface name, and architectural concept. Stale docs will mislead future development. This phase ensures ARCHITECTURE.md, RAMP_UP.md, and PROGRESS.md are authoritative.

---

## Design

### Documentation Updates

Three documents need full rewrites to reflect the new architecture:

- **ARCHITECTURE.md** — Mermaid diagrams for 8-package layout, provider registry flow, brain serialize/hydrate, skill loading pipeline, security middleware chain
- **RAMP_UP.md** — Must stay under 5000 tokens. Remove all references to deleted packages (comms, mcp, skills, heartbeat, firewall). Add provider configuration quickstart.
- **PROGRESS.md** — Record the consolidation as a milestone with PR references

### Final Cleanup

- Verify all Phase 1 temporary pass-throughs have been replaced with real implementations — grep for `TODO: Phase`, `stub`, and empty `return` patterns. Any remaining must be resolved before this phase completes.
- Verify `.gitignore` covers any new build artifacts (SQLite files, temp MCP configs)
- Full CI pass: `npm test && npm run build && npm run typecheck`

---

## Chunks

| # | Chunk | Committable Unit |
|---|-------|--------------------|
| 01 | [ARCHITECTURE.md](phase9-docs-cleanup/01_architecture-md.md) | Full rewrite with Mermaid diagrams |
| 02 | [RAMP_UP.md](phase9-docs-cleanup/02_ramp-up-md.md) | Rewrite for 8-package layout |
| 03 | [PROGRESS.md](phase9-docs-cleanup/03_progress-md.md) | Record consolidation milestone |
| 04 | [Final cleanup](phase9-docs-cleanup/04_final-cleanup.md) | Remove TODOs, gitignore, green CI |
| 05 | [Dependency audit + Zod unification](phase9-docs-cleanup/05_dependency-audit-zod-unification.md) | Prune orphaned deps, align Zod versions |

**Execution:** 01-03 can be parallel, 04-05 can be parallel after 01-03, both are final-pass work.
