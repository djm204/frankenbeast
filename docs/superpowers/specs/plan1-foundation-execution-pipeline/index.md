# Plan 1: Foundation — Execution Pipeline Implementation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake execution pipeline (stub processes that exit in 50ms) with real subprocess spawning, lifecycle tracking, config passthrough, error reporting, and SSE push updates.

**Architecture:** Six chunks building bottom-up: fix ProcessSupervisor to capture output and exits, wire callbacks through ProcessBeastExecutor to persistence, replace stub definitions with real CLI spawns, pass wizard config to spawned processes via JSON files, surface errors to the dashboard, and add SSE streaming for real-time updates.

**Tech Stack:** TypeScript, Node.js child_process + readline, Zod, Hono SSE, vitest

**Spec:** `docs/superpowers/specs/2026-03-16-plan1-foundation-execution-pipeline.md`
**ADRs:** `docs/adr/029-config-file-passthrough-spawned-agents.md`, `docs/adr/030-sse-connection-tickets-auth.md`

---

## Chunk Index

| # | Chunk | Summary | Depends On |
|---|-------|---------|------------|
| 01 | [ProcessSupervisor](./01_process-supervisor-exit-handling.md) | Exit handling, output capture, internal process registry | — |
| 02 | [ProcessBeastExecutor](./02_process-beast-executor-callback-wiring.md) | Wire supervisor callbacks to DB + logs, handleProcessExit, notification bridge | 01 |
| 03 | [Real buildProcessSpec](./03_real-build-process-spec.md) | Replace stubs with real CLI spawns, resolveCliEntrypoint, shouldDispatchOnCreate fix | 01 |
| 04 | [Config Passthrough](./04_config-file-passthrough.md) | RunConfigLoader, RunConfigSchema, JSON config file written before spawn | 02, 03 |
| 05 | [Error Reporting](./05_error-reporting-dashboard.md) | Structured error events, stderr capture surfacing, SIGTERM timeout escalation | 02 |
| 06 | [SSE Endpoint](./06_sse-event-bus-connection-tickets.md) | BeastEventBus, connection ticket auth, SSE stream route, sequence IDs + replay | 02, 05 |

## Audit Docs

| Doc | Purpose |
|-----|---------|
| [DISCREPANCIES.md](./DISCREPANCIES.md) | Current verified status of Plan 1 claims versus code |
| [DISCREPANCIES-PASS5-TRUTH-AUDIT.md](./DISCREPANCIES-PASS5-TRUTH-AUDIT.md) | Focused list of verified falsehoods, overstatements, and open gaps |
| [DISCREPANCIES-PASS8-SKEPTICAL-RECHECK.md](./DISCREPANCIES-PASS8-SKEPTICAL-RECHECK.md) | Second skeptical pass separating real fixes from remaining overclaims |
| [DISCREPANCIES-PASS4.md](./DISCREPANCIES-PASS4.md) | Corrected adversarial pass documenting false and misleading claims |

---

## Dependency Graph

```
01 ─→ 02 ─→ 04
  ╲        ╲
   → 03 ──→ 04
        02 → 05 → 06
```

Chunks 01 and 03 can begin in parallel. Chunk 04 requires both 02 and 03. Chunk 06 requires 02 and 05.

---

## Verification (after all chunks)

```bash
npx turbo run test --filter=franken-orchestrator
npx turbo run typecheck --filter=franken-orchestrator
npx turbo run build --filter=franken-orchestrator
```

All existing tests must continue to pass.
