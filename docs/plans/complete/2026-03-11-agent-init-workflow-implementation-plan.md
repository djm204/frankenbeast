# Agent Init Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify dashboard and CLI agent creation behind a tracked-agent init lifecycle, add file/directory picking to the catalog, add `Design Doc -> Chunk Creation`, and route chat-backed init actions through the tracked-agents flow.

**Architecture:** Add a tracked-agent layer above Beast runs, then rewire dashboard catalog launches to create tracked agents instead of dispatching direct runs. Use chat-backed commands for `design-interview` and `design-doc -> chunk creation`, while MartinLoop follows the same tracked-agent init lifecycle before dispatch.

**Tech Stack:** TypeScript, React, Hono, Vitest, SQLite-backed Beast persistence, chat runtime

---

### Task 1: Define tracked-agent domain types

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/types.ts`
- Create: `packages/franken-orchestrator/src/beasts/agent-types.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/types.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- tracked agent status values
- chat-backed init metadata
- linkage between tracked agent and dispatch run id

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/types.test.ts`
Expected: FAIL because tracked-agent shapes do not exist.

**Step 3: Write minimal implementation**

Add types for:
- tracked agent record
- tracked agent event/log entry
- init action kinds
- init status lifecycle

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/types.ts packages/franken-orchestrator/src/beasts/agent-types.ts packages/franken-orchestrator/tests/unit/beasts/types.test.ts
git commit -m "feat: add tracked agent domain types"
```

### Task 2: Add tracked-agent persistence and query APIs

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/repository/sqlite-schema.ts`
- Modify: `packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts`
- Create: `packages/franken-orchestrator/src/beasts/services/agent-service.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/sqlite-beast-repository.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/agent-service.test.ts`

**Step 1: Write the failing tests**

Cover:
- create tracked agent
- append init events/log metadata
- list tracked agents
- get tracked agent detail
- link tracked agent to Beast run

**Step 2: Run tests to verify they fail**

Run:
- `npm --workspace franken-orchestrator test -- tests/unit/beasts/sqlite-beast-repository.test.ts`
- `npm --workspace franken-orchestrator test -- tests/unit/beasts/agent-service.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

Add SQLite tables and repository methods for:
- tracked agent rows
- tracked agent events
- tracked agent metadata / linkage

Implement `AgentService` for create/list/get/update/link operations.

**Step 4: Run tests to verify they pass**

Run the same commands.
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/repository/sqlite-schema.ts packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts packages/franken-orchestrator/src/beasts/services/agent-service.ts packages/franken-orchestrator/tests/unit/beasts/sqlite-beast-repository.test.ts packages/franken-orchestrator/tests/unit/beasts/agent-service.test.ts
git commit -m "feat: persist tracked agents"
```

### Task 3: Expand the Beast catalog definitions for new init flows

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts`
- Modify: `packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts`
- Modify: `packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts`
- Modify: `packages/franken-orchestrator/src/beasts/definitions/catalog.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/catalog-service.test.ts`

**Step 1: Write the failing test**

Add coverage that:
- catalog contains `design-interview`
- catalog contains `chunk-plan` as “Design Doc -> Chunk Creation”
- MartinLoop requires chunk directory config

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/catalog-service.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Update definitions so:
- `chunk-plan` is operator-facing as design-doc-to-chunks
- MartinLoop prompts/config include chunk directory input
- descriptions match the new lifecycle

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/beasts/catalog-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts packages/franken-orchestrator/src/beasts/definitions/catalog.ts packages/franken-orchestrator/tests/unit/beasts/catalog-service.test.ts
git commit -m "feat: update beast catalog for init workflows"
```

### Task 4: Add tracked-agent HTTP routes

**Files:**
- Modify: `packages/franken-orchestrator/src/http/routes/beast-routes.ts`
- Create: `packages/franken-orchestrator/src/http/routes/agent-routes.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`
- Test: `packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts`
- Test: `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts`

**Step 1: Write the failing tests**

Cover:
- create tracked agent from dashboard
- list tracked agents
- get tracked agent detail with init metadata and linked run id

**Step 2: Run tests to verify they fail**

Run:
- `npm --workspace franken-orchestrator test -- tests/integration/beasts/agent-routes.test.ts`
- `npm --workspace franken-orchestrator test -- tests/integration/beasts/beast-routes.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

Add authenticated routes for:
- `POST /v1/beasts/agents`
- `GET /v1/beasts/agents`
- `GET /v1/beasts/agents/:id`

Mount them with the same operator auth model as Beast routes.

**Step 4: Run tests to verify they pass**

Run the same commands.
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/routes/beast-routes.ts packages/franken-orchestrator/src/http/routes/agent-routes.ts packages/franken-orchestrator/src/http/chat-app.ts packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts
git commit -m "feat: add tracked agent routes"
```

### Task 5: Wire chat-backed init actions into tracked agents

**Files:**
- Modify: `packages/franken-orchestrator/src/chat/beast-dispatch-adapter.ts`
- Modify: `packages/franken-orchestrator/src/chat/runtime.ts`
- Modify: `packages/franken-orchestrator/src/chat/turn-runner.ts`
- Create: `packages/franken-orchestrator/src/beasts/services/agent-init-service.ts`
- Test: `packages/franken-orchestrator/tests/unit/chat/beast-dispatch-adapter.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/agent-init-service.test.ts`

**Step 1: Write the failing tests**

Cover:
- `design-interview` tracked agent created before `/interview`-style init begins
- `chunk-plan` tracked agent created before `/plan --design-doc <path>`
- chat session linkage is persisted on the agent
- completion updates the tracked agent instead of skipping straight to run-only state

**Step 2: Run tests to verify they fail**

Run:
- `npm --workspace franken-orchestrator test -- tests/unit/chat/beast-dispatch-adapter.test.ts`
- `npm --workspace franken-orchestrator test -- tests/unit/beasts/agent-init-service.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

Add a service that:
- creates tracked agents for chat-backed init actions
- binds `agentId` to `chatSessionId`
- records init logs/events
- transitions to dispatch when init finishes or is approved

**Step 4: Run tests to verify they pass**

Run the same commands.
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/chat/beast-dispatch-adapter.ts packages/franken-orchestrator/src/chat/runtime.ts packages/franken-orchestrator/src/chat/turn-runner.ts packages/franken-orchestrator/src/beasts/services/agent-init-service.ts packages/franken-orchestrator/tests/unit/chat/beast-dispatch-adapter.test.ts packages/franken-orchestrator/tests/unit/beasts/agent-init-service.test.ts
git commit -m "feat: track chat-backed agent initialization"
```

### Task 6: Link dispatch/run creation back to tracked agents

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts`
- Modify: `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts`
- Modify: `packages/franken-orchestrator/src/beasts/create-beast-services.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/beast-dispatch-service.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/beasts/beast-run-service.test.ts`

**Step 1: Write the failing tests**

Cover:
- dispatch can be triggered from a tracked agent
- resulting run id links back to the tracked agent
- status transitions progress from `initializing` / `dispatching` into running/completed

**Step 2: Run tests to verify they fail**

Run:
- `npm --workspace franken-orchestrator test -- tests/unit/beasts/beast-dispatch-service.test.ts`
- `npm --workspace franken-orchestrator test -- tests/unit/beasts/beast-run-service.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

Add optional tracked-agent linkage in dispatch service and update run service/read models accordingly.

**Step 4: Run tests to verify they pass**

Run the same commands.
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts packages/franken-orchestrator/src/beasts/services/beast-run-service.ts packages/franken-orchestrator/src/beasts/create-beast-services.ts packages/franken-orchestrator/tests/unit/beasts/beast-dispatch-service.test.ts packages/franken-orchestrator/tests/unit/beasts/beast-run-service.test.ts
git commit -m "feat: link tracked agents to beast dispatch"
```

### Task 7: Add dashboard catalog picker controls and typed launch forms

**Files:**
- Modify: `packages/franken-web/src/pages/beast-dispatch-page.tsx`
- Modify: `packages/franken-web/src/styles/app.css`
- Test: `packages/franken-web/tests/components/beast-dispatch-page.test.tsx`

**Step 1: Write the failing tests**

Cover:
- design-doc entry renders a file picker control
- MartinLoop renders a directory picker control
- invalid path state blocks launch
- selected path is reflected in the input field

**Step 2: Run test to verify it fails**

Run: `npm --workspace @frankenbeast/web test -- tests/components/beast-dispatch-page.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

Add typed field rendering and validation for:
- text
- select
- file picker
- directory picker

**Step 4: Run test to verify it passes**

Run: `npm --workspace @frankenbeast/web test -- tests/components/beast-dispatch-page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/pages/beast-dispatch-page.tsx packages/franken-web/src/styles/app.css packages/franken-web/tests/components/beast-dispatch-page.test.tsx
git commit -m "feat: add beast catalog file and directory pickers"
```

### Task 8: Replace direct run creation in the dashboard with tracked-agent launch

**Files:**
- Modify: `packages/franken-web/src/lib/beast-api.ts`
- Modify: `packages/franken-web/src/components/chat-shell.tsx`
- Modify: `packages/franken-web/src/pages/beast-dispatch-page.tsx`
- Test: `packages/franken-web/tests/lib/beast-api.test.ts`
- Test: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Write the failing tests**

Cover:
- dashboard launches tracked agents via new API
- `design-interview` reuses selected chat session
- `chunk-plan` reuses selected chat session and sends `/plan --design-doc <path>`
- MartinLoop launches tracked agent instead of direct run creation

**Step 2: Run tests to verify they fail**

Run:
- `npm --workspace @frankenbeast/web test -- tests/lib/beast-api.test.ts`
- `npm --workspace @frankenbeast/web test -- tests/components/chat-shell.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

Add client methods and UI flow to:
- create tracked agent
- route to tracked agent detail
- reuse current chat session for chat-backed init actions
- stop using direct `createRun()` for catalog launch

**Step 4: Run tests to verify they pass**

Run the same commands.
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/lib/beast-api.ts packages/franken-web/src/components/chat-shell.tsx packages/franken-web/src/pages/beast-dispatch-page.tsx packages/franken-web/tests/lib/beast-api.test.ts packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "feat: launch tracked agents from dashboard catalog"
```

### Task 9: Show tracked-agent status and logs in the dashboard detail flow

**Files:**
- Modify: `packages/franken-web/src/lib/beast-api.ts`
- Modify: `packages/franken-web/src/pages/beast-dispatch-page.tsx`
- Modify: `packages/franken-web/src/components/chat-shell.tsx`
- Test: `packages/franken-web/tests/components/beast-dispatch-page.test.tsx`
- Test: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Write the failing tests**

Cover:
- tracked agents list renders init statuses
- detail view shows startup logs
- linked run info appears once dispatch has been triggered

**Step 2: Run tests to verify they fail**

Run:
- `npm --workspace @frankenbeast/web test -- tests/components/beast-dispatch-page.test.tsx`
- `npm --workspace @frankenbeast/web test -- tests/components/chat-shell.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

Adjust the existing runs/detail pane into tracked-agent detail with:
- lifecycle status
- init logs
- linked run information
- refresh behavior

**Step 4: Run tests to verify it passes**

Run the same commands.
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/lib/beast-api.ts packages/franken-web/src/pages/beast-dispatch-page.tsx packages/franken-web/src/components/chat-shell.tsx packages/franken-web/tests/components/beast-dispatch-page.test.tsx packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "feat: surface tracked agent lifecycle in dashboard"
```

### Task 10: End-to-end verification and docs sync

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/RAMP_UP.md`
- Modify: `packages/franken-web/README.md`
- Modify: `docs/PROGRESS.md`

**Step 1: Update docs**

Document:
- tracked-agent init lifecycle
- catalog entries and picker behavior
- chat-backed init action flow
- run linkage after dispatch

**Step 2: Run full verification**

Run:
- `npm --workspace franken-orchestrator test`
- `npm --workspace franken-orchestrator run typecheck`
- `npm --workspace @frankenbeast/web test`
- `npm --workspace @frankenbeast/web run typecheck`

Expected: all pass

**Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md docs/RAMP_UP.md docs/PROGRESS.md packages/franken-web/README.md
git commit -m "docs: describe tracked agent init workflow"
```
