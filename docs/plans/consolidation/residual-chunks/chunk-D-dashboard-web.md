# Chunk D: Dashboard & Web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SSE event streaming endpoints in the orchestrator and React dashboard panels in franken-web for skills, security, and providers.

**Architecture:** Orchestrator exposes Hono SSE routes at `/api/dashboard/events`. franken-web consumes them via `EventSource` and renders panels using existing React + Zustand + Radix UI patterns. franken-web has zero monorepo imports — all communication is HTTP-based.

**Tech Stack:** TypeScript, Vitest, Hono (SSE), React 18, Zustand, Radix UI, Tailwind CSS

**Resolves:** Phase 8 M2, Phase 8 M4

---

## File Map

### Create (Orchestrator — SSE endpoints)
- `packages/franken-orchestrator/src/http/routes/dashboard-routes.ts` — SSE + REST dashboard endpoints
- `packages/franken-orchestrator/tests/unit/http/dashboard-routes.test.ts`

### Create (franken-web — React panels)
- `packages/franken-web/src/components/skills/skill-card.tsx`
- `packages/franken-web/src/components/skills/skill-catalog-browser.tsx`
- `packages/franken-web/src/components/security/security-panel.tsx`
- `packages/franken-web/src/components/providers/provider-panel.tsx`
- `packages/franken-web/src/lib/dashboard-api.ts` — API client for dashboard endpoints
- `packages/franken-web/src/stores/dashboard-store.ts` — Zustand store for dashboard state
- Tests for each component

### Modify
- `packages/franken-orchestrator/src/http/chat-app.ts` — Mount dashboard routes
- `packages/franken-web/src/pages/` — Add dashboard page or extend existing

---

## Tasks

### Task 1: Dashboard SSE route

**Files:**
- Create: `src/http/routes/dashboard-routes.ts`
- Test: `tests/unit/http/dashboard-routes.test.ts`

- [ ] **Step 1:** Write failing test — GET `/api/dashboard/events` returns SSE stream with `Content-Type: text/event-stream`
- [ ] **Step 2:** Implement Hono SSE route using `streamSSE` helper
- [ ] **Step 3:** Write test — POST `/api/dashboard/skills` returns skill list
- [ ] **Step 4:** Implement REST endpoints for skills, providers, security status
- [ ] **Step 5:** Run tests, commit

### Task 2: Mount dashboard routes

**Files:**
- Modify: `src/http/chat-app.ts`

- [ ] **Step 1:** Add `dashboardControl` option to `ChatAppOptions`
- [ ] **Step 2:** Conditionally mount dashboard routes
- [ ] **Step 3:** Run tests, commit

### Task 3: Dashboard API client (franken-web)

**Files:**
- Create: `packages/franken-web/src/lib/dashboard-api.ts`

- [ ] **Step 1:** Write test — API client fetches skill list
- [ ] **Step 2:** Implement `fetchSkills()`, `fetchProviders()`, `fetchSecurityStatus()`
- [ ] **Step 3:** Implement `subscribeToDashboard()` SSE client
- [ ] **Step 4:** Run tests, commit

### Task 4: Zustand dashboard store

**Files:**
- Create: `packages/franken-web/src/stores/dashboard-store.ts`

- [ ] **Step 1:** Write test — store initializes with empty state
- [ ] **Step 2:** Implement store with skills, providers, security slices
- [ ] **Step 3:** Wire SSE subscription to update store
- [ ] **Step 4:** Run tests, commit

### Task 5: SkillCard + CatalogBrowser components

**Files:**
- Create: `packages/franken-web/src/components/skills/skill-card.tsx`
- Create: `packages/franken-web/src/components/skills/skill-catalog-browser.tsx`

- [ ] **Step 1:** Write test — SkillCard renders name, description, enabled toggle
- [ ] **Step 2:** Implement SkillCard with Radix Switch for toggle
- [ ] **Step 3:** Write test — CatalogBrowser renders list of SkillCards
- [ ] **Step 4:** Implement CatalogBrowser with search/filter
- [ ] **Step 5:** Run tests, commit

### Task 6: SecurityPanel component

**Files:**
- Create: `packages/franken-web/src/components/security/security-panel.tsx`

- [ ] **Step 1:** Write test — renders current profile and middleware toggles
- [ ] **Step 2:** Implement with profile selector + middleware status indicators
- [ ] **Step 3:** Run tests, commit

### Task 7: ProviderPanel component

**Files:**
- Create: `packages/franken-web/src/components/providers/provider-panel.tsx`

- [ ] **Step 1:** Write test — renders provider list with status badges
- [ ] **Step 2:** Implement with health indicators and failover order
- [ ] **Step 3:** Run tests, commit

### Task 8: franken-web import audit (Phase 8 M4)

- [ ] **Step 1:** Grep franken-web for any stale API endpoints that no longer exist
- [ ] **Step 2:** Update API client functions to match current orchestrator routes
- [ ] **Step 3:** Verify all franken-web tests pass
- [ ] **Step 4:** Commit

---

## Notes

- franken-web has zero monorepo package imports — this is by design. All new panels use HTTP API calls.
- Exploration showed franken-web already has no stale imports. M4 may be minimal.
- Follow existing component patterns (Radix UI, Tailwind, Zustand) visible in `packages/franken-web/src/components/`.
