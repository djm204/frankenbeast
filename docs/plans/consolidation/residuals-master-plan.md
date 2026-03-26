# Residuals Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each chunk task-by-task.

**Goal:** Resolve all Phase 1-8 residual issues accumulated during Architecture Consolidation.

**Architecture:** Phase 8 created `createBeastDeps()` with 6 adapters wrapping new components behind old `BeastLoopDeps` ports. The old `createCliDeps()` in `dep-factory.ts` is still called by `session.ts` and `run.ts`. Migrating callers to `createBeastDeps()` is the keystone that unlocks most Phase 2-7 medium residuals. Remaining work is CLI commands, dashboard/web UI, and targeted cleanup.

---

## Dependency Graph

```
Chunk A: Dep-Factory Migration (keystone)
    └─► Chunk B: Legacy Brain Cleanup (depends on A)

Chunk C: CLI Commands (sequence after A — modifies run.ts)
Chunk D: Dashboard & Web (independent, benefits from A)
Chunk E: Beast Definition Migration (independent)
Chunk F: SkillConfigStore (sequence after A — modifies create-beast-deps.ts)

One-Shots: All independent, can be done anytime
```

## Execution Order

1. **Chunk A** — Dep-Factory Migration (unblocks everything)
2. **Chunk B** — Legacy Brain Cleanup (quick follow-up to A)
3. **Chunks C, F** — Sequence after A (shared file modifications in `run.ts` / `create-beast-deps.ts`)
4. **Chunks D, E** — Truly independent, can run anytime
5. **One-Shots** — Sprinkle in between chunks or batch at the end

---

## Chunks (Multi-Step, Own Plan Files)

### [Chunk A: Dep-Factory Migration](residual-chunks/chunk-A-dep-factory-migration.md)
**Estimated size:** Large (the keystone)
**Resolves:** Phase 1.1, Phase 8 M1, Phase 3 M1/M2, Phase 4 M1/M2, Phase 4.5 M1/M2, Phase 5 M1/M2, Phase 6 M1, Phase 7 M1/M2

Migrate `session.ts` and `run.ts` from `createCliDeps()` to `createBeastDeps()`. Bridge the gap between old `CliDepOptions` and new `BeastDepsConfig + ExistingDeps`. Wire `RunConfigV2` into the startup path. Delete old `createCliDeps()`, stubs, and superseded adapters. Mount skill routes in `createChatApp()`.

### [Chunk B: Legacy Brain Cleanup](residual-chunks/chunk-B-legacy-brain-cleanup.md)
**Estimated size:** Small
**Resolves:** Phase 2 M1/M2
**Depends on:** Chunk A

Delete `franken-brain/src/episodic/`, `franken-brain/src/types/`, remove `ulid` and `zod` from `package.json`, clean up `index.ts` re-exports, remove `EpisodicMemoryPortAdapter`.

### [Chunk C: CLI Commands](residual-chunks/chunk-C-cli-commands.md)
**Estimated size:** Medium
**Resolves:** Phase 8 M3

Add `skill`, `provider`, `security`, `dashboard` command groups to the CLI. Each delegates to existing APIs (SkillManager, ProviderRegistry, SecurityConfig, dashboard server).

### [Chunk D: Dashboard & Web](residual-chunks/chunk-D-dashboard-web.md)
**Estimated size:** Large
**Resolves:** Phase 8 M2/M4

SSE event streaming endpoints in orchestrator. React components in franken-web: SkillCard, CatalogBrowser, SecurityPanel, ProviderPanel. franken-web import audit and API client updates.

### [Chunk E: Beast Definition Migration](residual-chunks/chunk-E-beast-definition-migration.md)
**Estimated size:** Small
**Resolves:** Phase 5 M3

Convert existing beast definitions (martin-loop, chunk-plan, design-interview) to `skills/<name>/` directories with `mcp.json` + `context.md`. Manual migration requiring understanding of each beast's MCP and context needs.

### [Chunk F: SkillConfigStore](residual-chunks/chunk-F-skill-config-store.md)
**Estimated size:** Small
**Resolves:** Phase 5 M4

Implement `SkillConfigStore` that persists enabled-skill state to `.frankenbeast/config.json`. Wire precedence: run config `skills:` > persisted defaults > empty.

---

## One-Shots (Single PR Each)

See [one-shots.md](residual-chunks/one-shots.md) for details.

| ID | Source | Description | Files |
|----|--------|-------------|-------|
| O1 | Phase 1.2 | Delete standalone comms server files, move `resolveCommsServerConfig` | `server/app.ts`, `server/start-comms-server.ts`, `comms-config.ts`, `managed-config.test.ts` |
| O2 | Phase 1.3 | HITL approval integration test (Slack webhook → gateway → governor) | New test file |
| O3 | Phase 2 I5 | Recovery checkpoint flush — add `flushToDb()` in `checkpoint()` | `sqlite-brain.ts` |
| O4 | Phase 2 I6 | Update `PROGRESS.md` with Phases 2-8 consolidation entries | `docs/PROGRESS.md` |

---

## Skipped (No Action Needed)

These are by-design, informational, or optional items that don't warrant action:

| ID | Source | Reason |
|----|--------|--------|
| Phase 2 I1 | `serialize()` hardcodes metadata | By design — orchestrator populates pre-handoff |
| Phase 2 I2 | Episodic capped at 100 | Informational — generous for typical runs |
| Phase 2 I3 | No `Symbol.dispose` | Nice-to-have, not blocking |
| Phase 2 I4 | DELETE-then-INSERT in flushToDb | Acceptable for <50 keys |
| Phase 2 S1 | Event IDs not stable | No consumer relies on cross-DB ID stability |
| Phase 2 S2 | No direct flushToDb test | Integration tests cover the path |
| Phase 3 I1 | `isAvailable()` auth check | Failover handles auth errors at execute time |
| Phase 4 I1 | `[CC]` vs `[CARD]` | Matches original frankenfirewall convention |
| Phase 4 I2 | Firewall test migration audit | New tests cover equivalent scenarios |
| Phase 4.5 I1 | Phase field not rendered | Supplementary — provider is primary |
| Phase 4.5 I2 | Webhook HTTP integration test | HTTP and gateway paths tested separately |
| Phase 5 I1 | Skill install credentials | Informational — extend API later |
| Phase 5 I2 | Skill health in GET /api/skills | Optional latency-adding enrichment |
| Phase 6 I1 | Type system mismatch | By design — implements actual `Evaluator` interface |
| Phase 6 I2 | Phase-boundary uses heartbeat.pulse() | Already resolved by ReflectionHeartbeatAdapter in Phase 8 |
| Phase 7 I1 | Wall-clock timestamps | Fine for v1 single-process append-only |
| Phase 8 I1 | Thin adapter placeholders | Correct for adapter pattern, enhance later |

---

## Residual Cross-Reference

Which chunk resolves which residual:

| Residual | Chunk |
|----------|-------|
| Phase 2 M1 (legacy brain code) | B |
| Phase 2 M2 (ulid/zod deps) | B |
| Phase 3 M1 (ProviderRegistry not wired) | A |
| Phase 3 M2 (token aggregation not wired) | A |
| Phase 4 M1 (middleware not in LLM path) | A |
| Phase 4 M2 (run config security field) | A |
| Phase 4.5 M1 (ChatRuntimeResult fields) | A |
| Phase 4.5 M2 (CommsRunConfigSchema) | A |
| Phase 5 M1 (skill routes not mounted) | A |
| Phase 5 M2 (loadForProvider) | A |
| Phase 5 M3 (beast definition migration) | E |
| Phase 5 M4 (SkillConfigStore) | F |
| Phase 6 M1 (ReflectionEvaluator not wired) | A |
| Phase 7 M1 (AuditTrail not in closure) | A |
| Phase 7 M2 (observer → audit bridge) | A |
| Phase 8 M1 (old dep-factory) | A |
| Phase 8 M2 (dashboard) | D |
| Phase 8 M3 (CLI commands) | C |
| Phase 8 M4 (franken-web cleanup) | D |
| Phase 1.1 (commsConfig) | A |
| Phase 1.2 (standalone comms files) | O1 |
| Phase 1.3 (HITL integration test) | O2 |
| Phase 2 I5 (checkpoint flush) | O3 |
| Phase 2 I6 (PROGRESS.md) | O4 |
