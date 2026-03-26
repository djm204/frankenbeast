# Phase 5 Residual Issues

Items identified during Phase 5 (Skill Loading) review that don't block the phase but should be tracked.

---

## M1. Skill routes not mounted in createChatApp

**Status:** Open (intentional)
**Severity:** Medium
**Context:** `createSkillRoutes()` exists and is tested via integration tests, but is not mounted in `createChatApp()` or any production server bootstrap. Same deferral pattern as Phases 2–4.

**Fix:** Phase 8 — mount `/api/skills` routes in chat-app.ts with SkillManager + ProviderRegistry deps.

---

## M2. SkillManager.loadForProvider() not implemented

**Status:** Open (intentional)
**Severity:** Medium
**Context:** Chunk 5.2 spec includes `loadForProvider()` that delegates to `ProviderSkillTranslator`. The method exists in the spec but is not on SkillManager — the translator exists as a standalone class. Wiring them together happens when dep-factory constructs the skill loading pipeline.

**Fix:** Phase 8 — add `loadForProvider()` to SkillManager or wire translator in dep-factory.

---

## M3. Beast definition migration not done (Chunk 5.8)

**Status:** Open
**Severity:** Medium
**Context:** Chunk 5.8 calls for converting existing beast definitions (martin-loop, chunk-plan, design-interview) to `skills/<name>/` directories with mcp.json + context.md. This is manual migration work that requires understanding each beast definition's MCP and context needs.

**Fix:** Manual migration — convert each beast definition to a skill directory.

---

## M4. SkillConfigStore for persistent toggle state not implemented (Chunk 5.11 partial)

**Status:** Open
**Severity:** Medium
**Context:** Chunk 5.11 calls for a `SkillConfigStore` that persists enabled-skill state to `.frankenbeast/config.json` across restarts. Currently, enabled state is in-memory only (the `Set<string>` passed to SkillManager constructor). Dashboard toggles work within a session but don't survive restarts.

**Fix:** Implement `SkillConfigStore` that reads/writes `.frankenbeast/config.json`. Wire precedence: run config `skills:` > persisted defaults > empty.

---

## I1. Skill install route does not capture/persist credentials (Chunk 5.9 partial)

**Status:** Open
**Severity:** Informational
**Context:** `SkillCredentialStore` exists and can read/write `.frankenbeast/.env`. The `POST /api/skills` route does not yet accept `credentials` in the request body or call `SkillCredentialStore.setMany()` during install. Install-time auth capture requires extending the install API.

**Fix:** Extend `POST /api/skills` to accept optional `credentials` field and persist via SkillCredentialStore.

---

## I2. Skill health endpoint not integrated into GET /api/skills

**Status:** Open
**Severity:** Informational
**Context:** `SkillHealthChecker` exists and can check MCP server status. `GET /api/skills` returns `SkillInfo` but does not include `mcpStatus`. Enriching the response with health data requires calling the checker per skill, which adds latency.

**Fix:** Add optional `?health=true` query param to `GET /api/skills` that enriches response with `mcpStatus` per skill.

---

## Summary

| ID | Severity | Blocks Phase 5? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Phase 8 |
| M2 | Medium | No | Phase 8 |
| M3 | Medium | No | Manual migration |
| M4 | Medium | No | SkillConfigStore implementation |
| I1 | Info | No | Extend install API |
| I2 | Info | No | Optional health enrichment |

**Verdict:** Phase 5 is complete. Core skill infrastructure (schemas, manager, translator, auth, discovery, routes, credential store, health checker) is built and tested. Integration and persistence wiring is Phase 8.
