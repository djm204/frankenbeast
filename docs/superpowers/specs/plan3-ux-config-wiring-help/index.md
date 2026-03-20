# Plan 3: UX — Config Wiring, Dashboard Accuracy, Help Docs

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire wizard config into typed API payloads, make the detail panel show real agent config instead of placeholders, replace polling with SSE streaming, and add help documentation.

**Architecture:** Five chunks: build the pure payload mapping function, update the detail panel to render real config, create the SSE event stream hook, update ChatShell wiring (daemon URL, remove polling), and add help docs to CLI + frontend.

**Tech Stack:** TypeScript, React, Zustand, vitest, EventSource API

**Spec:** `docs/superpowers/specs/2026-03-16-plan3-ux-config-wiring-help.md`

---

## Chunk Index

| # | Chunk | Summary | Depends On |
|---|-------|---------|------------|
| 01 | [Build Agent Payload](./01_build-agent-payload.md) | Pure function mapping wizard config → typed `ExtendedAgentCreateInput`, fix StepReview key mismatch | Plan 1 |
| 02 | [Agent Detail Real Config](./02_agent-detail-real-config.md) | Render real LLM, skills, prompts, git, module config in `AgentDetailReadonly` | 01 |
| 03 | [SSE Event Stream Hook](./03_sse-event-stream-hook.md) | `useBeastEventStream` React hook with ticket auth, reconnect, agent filtering | Plan 2 (daemon + SSE routes) |
| 04 | [ChatShell Wiring](./04_chatshell-wiring.md) | Dual base URLs, replace polling with SSE hook, update BeastApiClient construction | 01, 03 |
| 05 | [Help Docs](./05_help-docs.md) | CLI --help metadata, guide doc, wizard step help text | 01, 02 |

---

## Dependency Graph

```
01 → 02
  ╲
   → 04
03 → 04
01 + 02 → 05
```

Chunks 01 and 03 can begin in parallel (03 depends on Plan 2, not Plan 3 chunks). Chunk 02 requires 01. Chunk 04 requires both 01 and 03. Chunk 05 requires 01 and 02.

**Blocking dependency:** Chunk 03 (SSE hook) requires Plan 2 Chunk 01 (daemon with SSE endpoints) to be complete. Chunks 01, 02, and 05 can proceed independently of Plan 2.

---

## Verification (after all chunks)

```bash
npx turbo run test --filter=franken-web
npx turbo run typecheck --filter=franken-web
npx turbo run build --filter=franken-web
```

All existing tests must continue to pass.
