# Architecture Consolidation — Design Specs

**ADR:** [031-architecture-consolidation-provider-agnostic](../../adr/031-architecture-consolidation-provider-agnostic.md)
**Implementation Plan:** [2026-03-18-architecture-consolidation-plan.md](../2026-03-18-architecture-consolidation-plan.md)
**Date:** 2026-03-19
**Status:** Design

---

## Overview

Cut Frankenbeast from 13 packages to 8. Remove redundant packages, absorb infrastructure into the orchestrator, rewrite franken-brain for portable cross-provider memory, add provider registry with CLI + API adapters, implement marketplace-first skill loading via MCP, add configurable security profiles, and build a simple/advanced dashboard.

Fast ADR mapping: [ADR-031 Coverage Matrix](adr-031-coverage-matrix.md)

## Phase Index

| Phase | Design Doc | Chunks | Dependencies |
|-------|-----------|--------|-------------|
| 0 | [Stabilize Current Branch](phase0-stabilize.md) | [2 chunks](phase0-stabilize/) | None |
| 1 | [Remove Dead Packages](phase1-remove-packages.md) | [6 chunks](phase1-remove-packages/) | Phase 0 |
| 2 | [Rewrite franken-brain](phase2-brain-rewrite.md) | [4 chunks](phase2-brain-rewrite/) | Phase 1 |
| 3 | [Provider Registry + Adapters](phase3-provider-registry.md) | [10 chunks](phase3-provider-registry/) | Phase 2 |
| 4 | [Security Middleware](phase4-security-middleware.md) | [4 chunks](phase4-security-middleware/) | Phase 1 |
| 4.5 | [Comms Integration](phase4.5-comms-integration.md) | [5 chunks](phase4.5-comms-integration/) | Phase 1 + Phase 3 + Phase 4 |
| 5 | [Skill Loading](phase5-skill-loading.md) | [11 chunks](phase5-skill-loading/) | Phase 1 + Phase 3 |
| 6 | [Reflection → Critique](phase6-reflection-critique.md) | [2 chunks](phase6-reflection-critique/) | Phase 1 |
| 7 | [Observer Audit Trail](phase7-observer-audit.md) | [4 chunks](phase7-observer-audit/) | Phase 3 |
| 8 | [Wire Together + CLI + Dashboard](phase8-integration.md) | [8 chunks](phase8-integration/) | All previous |
| 9 | [Documentation + Cleanup](phase9-docs-cleanup.md) | [5 chunks](phase9-docs-cleanup/) | Phase 8 |

**Total: 61 chunks across 11 phases (0–9 + 4.5)**

## Execution Graph

```
Phase 0 → Phase 1 → ┬─ Phase 2 → Phase 3 ─┬─ Phase 7 ────────┐
                     │                      ├─ Phase 4.5 ──────┤
                     ├─ Phase 4 ────────────┘                  │
                     ├─ Phase 5 ───────────────────────────────┼─ Phase 8 → Phase 9
                     └─ Phase 6 ───────────────────────────────┘
```

**Phase 4.5** requires Phase 3 (provider metadata for outbound) + Phase 4 (security profiles for webhook verification). Chunk 01 only needs Phase 1; chunks 02–03 gate on Phase 3/4 respectively.

## Conventions

- **Phase docs** (`phaseN-<name>.md`): Design overview — what, why, success criteria, risks
- **Chunk files** (`phaseN-<name>/NN_<topic>.md`): Atomic implementation specs — interfaces, files, tests, exit criteria
- Each chunk is a single committable unit of work
- Chunk numbering is `NN_` (zero-padded) within each phase
- Cross-references use relative links
