# Phase 8 Residual Issues

Items identified during Phase 8 (Wire Everything Together) review.

---

## M1. Old dep-factory.ts not yet replaced

**Status:** Open
**Severity:** Medium
**Context:** `createBeastDeps()` exists as a new function in `create-beast-deps.ts` alongside the old `createCliDeps()` in `dep-factory.ts`. The old function is still called by `session.ts` and `run.ts`. Callers need to be migrated to the new function, and old stubs/adapters need to be deleted.

**Fix:** Update callers in session.ts/run.ts to use `createBeastDeps()`, then delete the old `createCliDeps()`, stubs, and old port adapters. This is a focused refactor of the call sites.

---

## M2. Dashboard chunks not implemented (8.3, 8.6)

**Status:** Open
**Severity:** Medium
**Context:** The dashboard server (8.3) with SSE event streaming and 4-panel UI, and the skill management UI (8.6) with React components, are franken-web concerns. These require React/frontend work in the franken-web package.

**Fix:** Implement in franken-web package — Hono SSE endpoints, React components (SkillCard, CatalogBrowser, SecurityPanel, ProviderPanel).

---

## M3. CLI commands not implemented (8.4)

**Status:** Open
**Severity:** Medium
**Context:** The `skill`, `provider`, `security`, `dashboard` CLI command groups are not implemented. The existing CLI only has `run` and `issues` subcommands.

**Fix:** Add command groups to the CLI parser. Each command delegates to the existing APIs (SkillManager, ProviderRegistry, SecurityConfig, dashboard server start).

---

## M4. franken-web cleanup not done (8.8)

**Status:** Open
**Severity:** Medium
**Context:** franken-web still references deleted packages and stale API endpoints. Needs import cleanup, new API client functions, and panel wiring.

**Fix:** Audit franken-web imports, remove deleted package refs, add new API client functions, wire panels.

---

## I1. Adapter implementations are thin placeholders for some ports

**Status:** Open
**Severity:** Informational
**Context:** `SkillManagerAdapter.execute()` returns a placeholder string — actual skill execution still goes through `CliSkillExecutor`. `McpSdkAdapter` is a stub. `ReflectionHeartbeatAdapter` without a reflectionFn just returns empty. These are correct for the adapter pattern but could be enhanced.

**Fix (optional):** Wire `SkillManagerAdapter.execute()` to `ProviderSkillTranslator` + provider execution. Wire `McpSdkAdapter` to `@modelcontextprotocol/sdk`. Wire `ReflectionHeartbeatAdapter` to `ReflectionEvaluator`.

---

## Summary

| ID | Severity | Blocks Phase 8? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Caller migration |
| M2 | Medium | No | franken-web work |
| M3 | Medium | No | CLI command implementation |
| M4 | Medium | No | franken-web cleanup |
| I1 | Info | No | Optional enhancement |

**Verdict:** Phase 8 core is complete. The adapter layer, createBeastDeps, E2E tests, and run-config v2 schema are built and tested. Remaining work is caller migration (M1), UI (M2/M4), and CLI (M3).
