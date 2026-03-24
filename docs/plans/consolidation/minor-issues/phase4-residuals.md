# Phase 4 Residual Issues

Minor items identified during Phase 4 (Security Middleware) review that don't block the phase but should be tracked.

---

## M1. Middleware chain not wired into any LLM call path

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The master spec says "Middleware chain runs on every LLM call." `buildMiddlewareChain()` and the concrete middleware classes exist and are tested, but no production code calls `chain.processRequest()` or `chain.processResponse()`. The `ProviderRegistry`, `run.ts`, and `dep-factory.ts` do not reference the middleware chain.

**Why kept:** No Phase 4 chunk includes dep-factory or ProviderRegistry modifications. Phase 8 (dep-factory rewiring) is responsible for wiring the middleware chain into the LLM execution path. This matches the Phase 2 and Phase 3 deferral pattern.

**Fix:** Phase 8 — `ProviderRegistry` (or a wrapper) accepts a `MiddlewareChain` and calls `processRequest` before each LLM call and `processResponse` after.

**Affected files:**
- `packages/franken-orchestrator/src/providers/provider-registry.ts`
- `packages/franken-orchestrator/src/cli/dep-factory.ts`

---

## M2. Run config `security:` field not implemented

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The Chunk 4.3 spec calls for a `security:` field in `run-config.yaml` that is parsed and applied. `RunConfigSchema` in `src/cli/run-config-loader.ts` has no `security` field. The middleware chain is configured only via the API routes.

**Why kept:** Run config wiring requires dep-factory integration to connect the parsed config to `buildMiddlewareChain()`. Deferred to Phase 8 alongside M1.

**Fix:** Phase 8 — add `SecurityConfigSchema.partial().optional()` as `security` field to `RunConfigSchema`, wire resolved config into `buildMiddlewareChain` in `run.ts`.

**Affected files:**
- `packages/franken-orchestrator/src/cli/run-config-loader.ts`
- `packages/franken-orchestrator/src/cli/run.ts`

---

## I1. Credit card replacement token is `[CC]` not `[CARD]`

**Status:** Open (by design)
**Severity:** Informational
**Context:** The Phase 4.2 spec shows `replacement: '[CARD]'` for credit card masking. The implementation uses `[CC]`, matching the original frankenfirewall's `pii-masker.ts`. Tests assert `[CC]`.

**Fix:** None needed. The original firewall convention was `[CC]` and is used consistently.

---

## I2. Existing firewall test coverage not formally migrated

**Status:** Open
**Severity:** Informational
**Context:** The Phase 4 master spec says "Existing firewall test coverage migrated or replaced." The new middleware tests cover the same patterns and scenarios as the original firewall tests, but this was done by implementing equivalent tests — not by mechanically migrating each original test case. Some edge cases from the original `injection-scanner.test.ts` (e.g., multi-block content, empty messages array) are covered; others may have been dropped.

**Fix (optional):** Compare the original test file (`v0.pre-consolidation:packages/frankenfirewall/src/interceptors/inbound/injection-scanner.test.ts`) against the new `injection-detection.test.ts` for any missing edge cases.

---

## Summary

| ID | Severity | Blocks Phase 4? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Phase 8 |
| M2 | Medium | No | Phase 8 |
| I1 | Info | No | By design |
| I2 | Info | No | Optional audit |

**Verdict:** Phase 4 is complete. All medium items are tracked for Phase 8. No blockers.
