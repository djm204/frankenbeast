# Chunk 04: ChatShell Wiring — Dual URLs, Remove Polling, Wire Payload Builder

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `ChatShell` to use the beast daemon URL for beast operations, replace the polling `useEffect` with `useBeastEventStream`, and wire `buildAgentCreatePayload` into the launch handler.

**Spec section:** Plan 3, Sections 1 (wiring) + 3 (polling replacement)

---

## Pre-conditions

- Chunk 01 complete (`buildAgentCreatePayload` exists, `BeastApiClient.createAgent` accepts `ExtendedAgentCreateInput`)
- Chunk 03 complete (`useBeastEventStream` hook exists)

---

## Files

- **Modify:** `packages/franken-web/src/components/chat-shell.tsx`
- **Modify:** `packages/franken-web/.env` (add `VITE_BEAST_DAEMON_URL`)
- **Test:** Integration tests or manual verification

---

## Context

Read these files before starting:

- `packages/franken-web/src/components/chat-shell.tsx` — 550 lines. Key sections:
  - Line 135-138: `beastClient` construction using `baseUrl` (chat-server URL)
  - Lines 178-242: polling `useEffect` with 4-second interval
  - Lines 453-460: `onLaunch` handler — sends opaque `initConfig`
  - `beastRefreshNonce` state used to trigger re-fetches
- `packages/franken-web/src/lib/build-agent-payload.ts` — from Chunk 01
- `packages/franken-web/src/hooks/use-beast-event-stream.ts` — from Chunk 03

---

## Current State

`ChatShell` uses a single `baseUrl` for both chat and beast operations. It polls every 4 seconds. The `onLaunch` handler sends the entire wizard config as an opaque `initConfig` blob.

**After this chunk:**
- Chat operations use `baseUrl` (chat-server)
- Beast operations use `VITE_BEAST_DAEMON_URL` (daemon)
- Polling `useEffect` is removed, replaced by `useBeastEventStream`
- `onLaunch` uses `buildAgentCreatePayload` to create typed payload

---

## Tasks

### Task 1: Add VITE_BEAST_DAEMON_URL env var

- [ ] **Step 1: Update .env**

In `packages/franken-web/.env`:

```
VITE_BEAST_DAEMON_URL=http://localhost:4050
```

- [ ] **Step 2: Commit**

```bash
git add packages/franken-web/.env
git commit -m "chore(web): add VITE_BEAST_DAEMON_URL env var"
```

---

### Task 2: Create separate beastClient for daemon URL

- [ ] **Step 1: Update beastClient construction**

In `packages/franken-web/src/components/chat-shell.tsx`:

```typescript
// Before (line 135-138):
const beastClient = useMemo(
  () => (beastOperatorToken ? new BeastApiClient(baseUrl, beastOperatorToken) : null),
  [baseUrl, beastOperatorToken],
);

// After:
const beastDaemonUrl = import.meta.env.VITE_BEAST_DAEMON_URL ?? baseUrl;
const beastClient = useMemo(
  () => (beastOperatorToken ? new BeastApiClient(beastDaemonUrl, beastOperatorToken) : null),
  [beastDaemonUrl, beastOperatorToken],
);
```

- [ ] **Step 2: Verify typecheck**

Run: `npx turbo run typecheck --filter=franken-web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/franken-web/src/components/chat-shell.tsx
git commit -m "feat(web): use VITE_BEAST_DAEMON_URL for beast API client"
```

---

### Task 3: Replace polling with useBeastEventStream

- [ ] **Step 1: Add the hook call**

In `packages/franken-web/src/components/chat-shell.tsx`:

```typescript
import { useBeastEventStream } from '../hooks/use-beast-event-stream.js';

// Inside ChatShell component:
const beastDaemonUrl = import.meta.env.VITE_BEAST_DAEMON_URL ?? baseUrl;
const {
  agents: beastAgents,
  selectedAgentDetail: beastAgentDetail,
  logs: beastLogs,
  connectionStatus: beastConnectionStatus,
  selectAgent: selectBeastAgent,
} = useBeastEventStream(beastDaemonUrl, beastOperatorToken ?? '');
```

- [ ] **Step 2: Remove the polling useEffect**

Delete the polling `useEffect` block (lines ~178-242) that:
- Calls `refreshBeasts()` on interval
- Sets `beastAgents`, `beastAgentDetail` state
- Uses `beastRefreshNonce`

Remove these state variables that are now provided by the hook:
- `beastAgents` state
- `beastAgentDetail` state
- `beastRefreshNonce` state
- `refreshBeasts` function

Keep:
- `GET /v1/beasts/catalog` fetch (once on mount — catalog is static)
- Write operations (POST start/stop/restart/kill/delete) — these remain as HTTP calls. After success, the SSE stream delivers the state update automatically.

- [ ] **Step 3: Wire selectAgent and logs bridging**

Ensure that when the user clicks an agent in the beast panel, it calls `selectBeastAgent(agentId)` instead of setting `selectedBeastAgentId` state. The hook handles agent detail tracking without reconnecting.

Bridge the hook's `logs: Map<runId, string[]>` to the `BeastsPage.logs: string[]` prop using the selected agent's dispatch run ID:

```typescript
const agentLogs = beastLogs.get(
  (beastAgentDetail as any)?.dispatchRunId ?? ''
) ?? [];
// Pass agentLogs to BeastsPage where it currently receives beastAgentDetail?.run?.logs ?? []
```

- [ ] **Step 4: Remove beastRefreshNonce from mutation handlers**

After write operations (stop, restart, delete, etc.), remove `setBeastRefreshNonce(n => n + 1)`. The SSE stream will push the updated state.

- [ ] **Step 5: Verify no regressions**

Run: `npx turbo run typecheck --filter=franken-web && npx turbo run test --filter=franken-web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-web/src/components/chat-shell.tsx
git commit -m "feat(web): replace 4s polling with useBeastEventStream SSE hook"
```

---

### Task 4: Wire buildAgentCreatePayload into onLaunch

- [ ] **Step 1: Update onLaunch handler**

In `packages/franken-web/src/components/chat-shell.tsx`:

```typescript
import { buildAgentCreatePayload } from '../lib/build-agent-payload.js';

// In onLaunch callback (lines ~453-460):
// Before:
const onLaunch = async (config: Record<string, unknown>) => {
  const definitionId = config.workflow?.workflowType as string;
  await beastClient.createAgent({
    definitionId,
    initAction: buildInitAction(config.workflow),
    initConfig: config,
  });
  setBeastRefreshNonce((n) => n + 1);
};

// After:
const onLaunch = async (config: Record<string, unknown>) => {
  // Pass chatSessionId so design-interview agents join the current chat session
  const payload = buildAgentCreatePayload(config, selectedSessionId ?? undefined);
  await beastClient!.createAgent(payload);
  // No refresh nonce needed — SSE pushes the update
};
```

- [ ] **Step 2: Remove buildInitAction helper from chat-shell.tsx**

The `buildInitAction` function (lines ~61-89 in chat-shell.tsx) is now handled inside `buildAgentCreatePayload`. Remove it.

- [ ] **Step 3: Run tests**

Run: `npx turbo run test --filter=franken-web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-web/src/components/chat-shell.tsx
git commit -m "feat(web): wire buildAgentCreatePayload into wizard launch handler"
```
