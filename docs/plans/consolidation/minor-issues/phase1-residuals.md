# Phase 1 Residual Issues

Minor items identified during Phase 1 review that don't block the PR but should be addressed.

---

## 1. `startChatServer()` does not pass `commsConfig` to `createChatApp()`

**Status:** Open
**Severity:** Low
**Context:** `commsRoutes` are wired into `createChatApp()` via the optional `commsConfig` field on `ChatAppOptions`. However, `startChatServer()` in `src/http/chat-server.ts` does not currently pass `commsConfig` when constructing the app. This means comms webhook routes only activate if the caller manually provides the config.

**Fix:** In `startChatServer()`, resolve comms config from `OrchestratorConfig.comms` and pass it as `commsConfig` to `createChatApp()`. This should happen in Phase 4.5 (comms integration) which already covers wiring comms startup into the orchestrator's server lifecycle.

**Affected files:**
- `packages/franken-orchestrator/src/http/chat-server.ts`

---

## 2. Standalone comms server files still exist

**Status:** Open (intentional)
**Severity:** Informational
**Context:** `src/comms/server/app.ts` and `src/comms/server/start-comms-server.ts` remain after the absorption. The plan said "routes merge into orchestrator's existing Hono server" — which is done via `comms-routes.ts`. The standalone server files are now redundant for production use since `comms-gateway-service.ts` no longer spawns them.

**Why kept:**
- `resolveCommsServerConfig()` from `start-comms-server.ts` is imported by `managed-config.test.ts`
- The standalone launcher could be useful for isolated comms testing
- `comms/index.ts` re-exports from these files

**Fix (optional):** Move `resolveCommsServerConfig()` to `comms/config/comms-config.ts`, update the test import, then delete `server/app.ts` and `server/start-comms-server.ts`. Low priority — they're harmless dead code.

**Affected files:**
- `packages/franken-orchestrator/src/comms/server/app.ts`
- `packages/franken-orchestrator/src/comms/server/start-comms-server.ts`
- `packages/franken-orchestrator/src/comms/index.ts`
- `packages/franken-orchestrator/tests/unit/comms/managed-config.test.ts`

---

## 3. No integration test for HITL approval via comms channels

**Status:** Open
**Severity:** Low
**Context:** Phase 1 exit criterion states "HITL approval via Slack buttons still works". The route wiring is correct and unit tests pass, but there is no integration test exercising the full flow: Slack webhook → comms route → ChatGateway → orchestrator → governor approval.

**Fix:** Add an integration test in `tests/integration/comms/` that sends a mock Slack interaction payload through the comms routes and verifies it reaches the gateway's `handleAction()`. This is naturally covered by Phase 4.5 (comms integration).

**Affected files:**
- New: `packages/franken-orchestrator/tests/integration/comms/slack-hitl.test.ts` (or similar)
