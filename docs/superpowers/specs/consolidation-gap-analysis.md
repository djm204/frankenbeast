# Consolidation Gap Analysis: ADR-031 vs. Implementation Plan

This document tracks verified discrepancies between the architectural decisions in **ADR-031** and the sequential steps in the **Architecture Consolidation Plan**.

Verification pass completed against the repository state on **2026-03-19**.

## 1. Items Already Covered by the Current Plan

### Comms Integration Strategy
- **ADR-031**: Explicitly mandates removing the localhost WebSocket hop and replacing `ChatSocketBridge` with direct in-process `ChatRuntime.run()` calls.
- **Plan**: Phase 1.1 intentionally keeps the bridge during package absorption, and Phase 4.5 already adds a dedicated chunk for the runtime refactor: `phase4.5-comms-integration/01_direct-runtime-integration.md`.
- **Conclusion**: No new **Chunk 1.7** is needed. The gap was closed by the later Phase 4.5 planning pass.

### Provider-Specific Skill Discovery
- **ADR-031**: Lists specific discovery paths (Claude Marketplace, Codex CLI list, Gemini Extensions).
- **Plan**: Phase 5.5 already defines provider-specific behavior inside the chunk, and the provider adapter chunks in Phase 3 carry the per-provider implementation details.
- **Conclusion**: Splitting into **5.5a/5.5b/5.5c** is optional project-management preference, not a missing architectural chunk.

### Dashboard "Simple/Advanced" Modes
- **ADR-031**: Devotes significant detail to the UI difference between Simple and Advanced modes.
- **Plan**: Chunk 8.3 already includes the dual-mode shell, `localStorage` persistence, and panel-specific simple vs. advanced behavior.
- **Conclusion**: No additional **Chunk 8.6** is required for mode state management.

### Handoff Verification
- **ADR-031**: Makes `BrainSnapshot` handoff and `formatHandoff()` central to provider failover.
- **Plan**: The provider adapter chunks already include `formatHandoff()` tests, and Chunk 3.2 verifies failover injects handoff context during provider switching.
- **Conclusion**: No extra **Chunk 3.10** is required to establish test coverage at the planning level.

## 2. Remaining Planning Clarification

### Brain Recovery Memory
- **ADR-031**: Defines "Recovery Memory" as one of the three primary types.
- **Plan**: Phase 1.4 removes heartbeat-owned integration points first, while Phase 2.2 introduces `SqliteBrain.recovery`.
- **Verified implementation context**: The orchestrator already has file-based checkpoint recovery via `ICheckpointStore` and `FileCheckpointStore`; that path is not provided by `franken-heartbeat`.
- **Risk**: The plan wording can be misread as "all recovery disappears in Phase 1," even though existing task-execution checkpoint recovery remains available.
- **Fix**: Clarify Phase 1.4 to explicitly preserve the current `FileCheckpointStore` path during the transition and describe Phase 2 recovery as a new provider-agnostic brain capability, not a temporary return from zero recovery.

## 3. Recommended Updates

| Area | Update | Rationale |
|:--- |:--- |:--- |
| Gap analysis doc | Replace stale "missing chunk" findings with references to existing chunks (Phase 4.5, 5.5, 8.3, Phase 3 adapter tests). | The current plan already covers these items. |
| Phase 1.4 | Clarify that existing orchestrator `FileCheckpointStore` recovery remains live during heartbeat deletion. | Prevents a false impression of a temporary recovery regression. |
