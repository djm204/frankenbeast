# ADR-031 Coverage Matrix

**ADR:** [031-architecture-consolidation-provider-agnostic](../../adr/031-architecture-consolidation-provider-agnostic.md)
**Plan Index:** [index.md](index.md)
**Purpose:** Fast mapping from ADR-031 commitments to consolidation phases/chunks.

## How To Use

- Start with the relevant ADR section below.
- Follow the linked phase/chunk docs as the implementation path.
- Treat `Clarified` items as covered, but with wording that agents should read carefully.

## Coverage Summary

| ADR Area | Status | Primary Plan Coverage |
|---|---|---|
| Package consolidation (13 → 8) | Covered | Phase 1, Phase 9 |
| Portable SQLite brain | Covered | Phase 2 |
| Provider registry + CLI/API adapters | Covered | Phase 3 |
| Cross-provider failover + handoff | Covered | Phase 2, Phase 3, Phase 8 |
| MCP client-only integration | Covered | Phase 1, Phase 8 |
| Marketplace-first skills | Covered | Phase 5, Phase 8 |
| Direct comms integration | Covered | Phase 1, Phase 4.5 |
| Configurable security profiles | Covered | Phase 4, Phase 8 |
| Reflection absorbed into critique | Covered | Phase 6, Phase 8 |
| Observer reframed as provable audit | Covered | Phase 7, Phase 8 |
| Simple/Advanced dashboard | Covered | Phase 8 |
| Web standalone REST/SSE boundary | Covered | Phase 8 |
| Docs and cleanup | Covered | Phase 9 |
| Transitional checkpoint wording | Clarified | Phase 1.4, Phase 2, Phase 8 |

## ADR Decision Mapping

### Packages Retained / Removed

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| Remove redundant packages and end at 8 packages | [phase1-remove-packages.md](phase1-remove-packages.md), [phase9-docs-cleanup.md](phase9-docs-cleanup.md) | Phase 1 performs the package deletions/absorption; Phase 9 removes stale documentation and leftovers. |
| `franken-comms` absorbed into orchestrator | [01_remove-franken-comms.md](phase1-remove-packages/01_remove-franken-comms.md), [phase4.5-comms-integration.md](phase4.5-comms-integration.md) | Phase 1 moves code; Phase 4.5 completes architectural integration. |
| `franken-mcp` removed, orchestrator uses MCP SDK directly | [02_remove-franken-mcp.md](phase1-remove-packages/02_remove-franken-mcp.md), [phase8-integration.md](phase8-integration.md) | Adapter wiring lands in Phase 8. |
| `franken-skills` replaced by marketplace-first skill loading | [03_remove-franken-skills.md](phase1-remove-packages/03_remove-franken-skills.md), [phase5-skill-loading.md](phase5-skill-loading.md) | Full replacement path is explicit. |
| `franken-heartbeat` split across critique/orchestrator | [04_remove-franken-heartbeat.md](phase1-remove-packages/04_remove-franken-heartbeat.md), [phase6-reflection-critique.md](phase6-reflection-critique.md), [phase8-integration.md](phase8-integration.md) | Reflection and runtime trigger are restored later via adapters/config. |
| `frankenfirewall` absorbed as middleware | [05_remove-frankenfirewall.md](phase1-remove-packages/05_remove-frankenfirewall.md), [phase4-security-middleware.md](phase4-security-middleware.md) | Phase 4 defines the replacement. |

### Provider-Agnostic Memory

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| `franken-brain` rewritten as SQLite-backed working/episodic/recovery memory | [phase2-brain-rewrite.md](phase2-brain-rewrite.md) | Phase 2 is a direct ADR match. |
| `IBrain`, `BrainSnapshot`, handoff types in `franken-types` | [01_brain-interfaces-types.md](phase2-brain-rewrite/01_brain-interfaces-types.md), [01_provider-interfaces-types.md](phase3-provider-registry/01_provider-interfaces-types.md) | Types are split cleanly between brain and provider contracts. |
| `serialize()` / `hydrate()` support provider switching | [02_sqlite-brain-implementation.md](phase2-brain-rewrite/02_sqlite-brain-implementation.md), [09_provider-failover-integration.md](phase3-provider-registry/09_provider-failover-integration.md) | Covered at both unit and integration levels. |
| Recovery memory via checkpoints | [02_sqlite-brain-implementation.md](phase2-brain-rewrite/02_sqlite-brain-implementation.md), [02_beast-loop-phases.md](phase8-integration/02_beast-loop-phases.md) | Brain-native recovery is implemented in Phase 2 and wired in Phase 8. |

### Provider Registry + Adapters

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| `ProviderRegistry` with ordered failover | [02_provider-registry.md](phase3-provider-registry/02_provider-registry.md), [03_dashboard-simple-advanced.md](phase8-integration/03_dashboard-simple-advanced.md), [04_cli-commands.md](phase8-integration/04_cli-commands.md) | Includes runtime reordering via dashboard and CLI. |
| Claude CLI adapter | [03_claude-cli-adapter.md](phase3-provider-registry/03_claude-cli-adapter.md) | Covered. |
| Codex CLI adapter | [04_codex-cli-adapter.md](phase3-provider-registry/04_codex-cli-adapter.md) | Covered, including Codex-specific MCP/OAuth behavior. |
| Gemini CLI adapter | [05_gemini-cli-adapter.md](phase3-provider-registry/05_gemini-cli-adapter.md) | Covered. |
| Anthropic API adapter | [06_anthropic-api-adapter.md](phase3-provider-registry/06_anthropic-api-adapter.md) | Covered. |
| OpenAI API adapter | [07_openai-api-adapter.md](phase3-provider-registry/07_openai-api-adapter.md) | Covered. |
| Gemini API adapter | [08_gemini-api-adapter.md](phase3-provider-registry/08_gemini-api-adapter.md) | Covered. |
| `formatHandoff(snapshot)` is provider-specific | [03_claude-cli-adapter.md](phase3-provider-registry/03_claude-cli-adapter.md), [04_codex-cli-adapter.md](phase3-provider-registry/04_codex-cli-adapter.md), [05_gemini-cli-adapter.md](phase3-provider-registry/05_gemini-cli-adapter.md), [06_anthropic-api-adapter.md](phase3-provider-registry/06_anthropic-api-adapter.md), [07_openai-api-adapter.md](phase3-provider-registry/07_openai-api-adapter.md), [08_gemini-api-adapter.md](phase3-provider-registry/08_gemini-api-adapter.md) | Tests are already embedded in the adapter chunks. |
| Cross-provider token tracking | [10_cross-provider-token-aggregation.md](phase3-provider-registry/10_cross-provider-token-aggregation.md) | Explicit ADR metadata support. |

### Marketplace-First Skill Loading

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| Skills stored as directories with `mcp.json` and optional `context.md` | [01_skill-directory-schemas.md](phase5-skill-loading/01_skill-directory-schemas.md), [02_skill-manager.md](phase5-skill-loading/02_skill-manager.md) | Covered. |
| Marketplace discovery per provider | [05_provider-skill-discovery.md](phase5-skill-loading/05_provider-skill-discovery.md), Phase 3 CLI adapter chunks | Covered. |
| Provider-neutral storage, provider-specific translation at spawn time | [03_provider-skill-translation.md](phase5-skill-loading/03_provider-skill-translation.md) | Includes CLI and API adapter paths. |
| API key, CLI login, and OAuth install flows | [04_skill-auth.md](phase5-skill-loading/04_skill-auth.md), [09_skill-install-auth-persistence.md](phase5-skill-loading/09_skill-install-auth-persistence.md) | Covered. |
| Dashboard skill CRUD APIs | [06_skill-api-routes.md](phase5-skill-loading/06_skill-api-routes.md), [11_skill-toggle-persistence-context-routes.md](phase5-skill-loading/11_skill-toggle-persistence-context-routes.md) | Includes toggle persistence and context routes. |
| Health/status and provider origin metadata | [10_skill-health-provider-metadata.md](phase5-skill-loading/10_skill-health-provider-metadata.md) | Explicitly added because the ADR requires advanced dashboard metadata. |
| Skill management UI | [06_dashboard-skill-management.md](phase8-integration/06_dashboard-skill-management.md) | Full UI surface. |

### MCP Runtime Boundary

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| Orchestrator connects to MCP servers as a client via `@modelcontextprotocol/sdk` | [02_remove-franken-mcp.md](phase1-remove-packages/02_remove-franken-mcp.md), [phase8-integration.md](phase8-integration.md) | Covered through package removal plus adapter-based reintegration. |
| No custom MCP server hosting in v1 | [02_remove-franken-mcp.md](phase1-remove-packages/02_remove-franken-mcp.md) | Explicitly stated in the removal chunk. |

### Comms Absorption

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| Move comms into orchestrator | [01_remove-franken-comms.md](phase1-remove-packages/01_remove-franken-comms.md) | Structural absorption. |
| Replace `ChatSocketBridge` with direct `ChatRuntime.run()` | [01_direct-runtime-integration.md](phase4.5-comms-integration/01_direct-runtime-integration.md) | Covered; no extra missing chunk. |
| Provider-aware outbound replies | [02_provider-aware-outbound.md](phase4.5-comms-integration/02_provider-aware-outbound.md) | Covered. |
| Security profile integration for webhook verification | [03_webhook-security-profiles.md](phase4.5-comms-integration/03_webhook-security-profiles.md) | Covered. |
| Comms in consolidated run-config | [04_comms-run-config.md](phase4.5-comms-integration/04_comms-run-config.md), [07_run-config-schema-v2.md](phase8-integration/07_run-config-schema-v2.md) | Covered. |
| Round-trip integration proof | [05_comms-integration-test.md](phase4.5-comms-integration/05_comms-integration-test.md) | Covered. |

### Configurable Security

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| `strict` / `standard` / `permissive` profiles | [03_security-profiles.md](phase4-security-middleware/03_security-profiles.md) | Direct ADR match. |
| Middleware chain for request/response protection | [02_llm-middleware-chain.md](phase4-security-middleware/02_llm-middleware-chain.md) | Covered. |
| Domain allowlist semantics | [04_domain-allowlist.md](phase4-security-middleware/04_domain-allowlist.md) | Covered. |
| Dashboard/API security control | [03_security-profiles.md](phase4-security-middleware/03_security-profiles.md), [03_dashboard-simple-advanced.md](phase8-integration/03_dashboard-simple-advanced.md) | Covered. |
| CLI security control | [04_cli-commands.md](phase8-integration/04_cli-commands.md), [07_run-config-schema-v2.md](phase8-integration/07_run-config-schema-v2.md) | Covered. |

### Reflection, Audit, Dashboard, Integration

| ADR Commitment | Plan Coverage | Notes |
|---|---|---|
| Reflection becomes critique evaluator | [phase6-reflection-critique.md](phase6-reflection-critique.md) | Covered. |
| Periodic self-assessment restored via config flag | [02_reflection-runtime-trigger.md](phase6-reflection-critique/02_reflection-runtime-trigger.md), [07_run-config-schema-v2.md](phase8-integration/07_run-config-schema-v2.md) | Covered. |
| `franken-observer` reframed from telemetry to provable execution audit | [phase7-observer-audit.md](phase7-observer-audit.md), [01_audit-event-schema.md](phase7-observer-audit/01_audit-event-schema.md), [04_audit-trail-persistence.md](phase7-observer-audit/04_audit-trail-persistence.md) | Covered. |
| Replayable audit trail with provider switch records | [phase7-observer-audit.md](phase7-observer-audit.md), [03_provider-switch-audit.md](phase7-observer-audit/03_provider-switch-audit.md), [04_audit-trail-persistence.md](phase7-observer-audit/04_audit-trail-persistence.md) | Covered. |
| Simple / Advanced dashboard modes | [03_dashboard-simple-advanced.md](phase8-integration/03_dashboard-simple-advanced.md) | Covered. |
| Dashboard panels: Agents / Skills / Providers / Security | [03_dashboard-simple-advanced.md](phase8-integration/03_dashboard-simple-advanced.md), [06_dashboard-skill-management.md](phase8-integration/06_dashboard-skill-management.md) | Covered. |
| `franken-web` remains standalone and talks to orchestrator via REST/SSE | [03_dashboard-simple-advanced.md](phase8-integration/03_dashboard-simple-advanced.md), [08_franken-web-cleanup.md](phase8-integration/08_franken-web-cleanup.md), [05_e2e-integration-test.md](phase8-integration/05_e2e-integration-test.md) | Covered. |
| Beast Loop wired through adapters, preserving existing orchestration | [01_dep-factory-rewiring.md](phase8-integration/01_dep-factory-rewiring.md), [02_beast-loop-phases.md](phase8-integration/02_beast-loop-phases.md), [05_e2e-integration-test.md](phase8-integration/05_e2e-integration-test.md) | Covered. |

## Clarifications For Agents

- `Phase 1.1` does **not** complete the comms runtime refactor. That happens in `Phase 4.5`.
- `Phase 1.4` removes heartbeat-owned integrations, but existing orchestrator `FileCheckpointStore` recovery still exists during the transition. Brain-native recovery arrives in `Phase 2`.
- `Chunk 8.6`, `Chunk 5.9`, and `Chunk 3.10` already exist even though the filename numbering is zero-padded (`06_`, `09_`, `10_`).
- ADR future directions such as plugin-system extensibility are intentionally not chunked for v1.

## Current Assessment

- No major ADR-031 implementation area is missing from the chunk set.
- Remaining issues are documentation consistency and execution sequencing clarity, not absent architectural coverage.
