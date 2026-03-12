# Beast Dashboard Path And Run Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix dashboard `chunk-plan` path handling and add tracked-agent `Pause`, `Resume`, and immediate `Kill` controls that preserve run attempts under each agent.

**Architecture:** The web dashboard will stop treating server-path fields as browser file uploads and will validate them as plain text repo/server paths. Backend changes will add an agent-centric resume action while reusing existing graceful stop (`SIGTERM`) and immediate kill (`SIGKILL`) execution paths, so resume creates a new attempt without breaking tracked-agent history.

**Tech Stack:** React, TypeScript, Vitest, Hono, existing Frankenbeast tracked-agent/run services

---

### Task 1: Lock Down The Fakepath Regression In The Web Form

**Files:**
- Modify: `packages/franken-web/tests/components/beast-dispatch-page.test.tsx`
- Modify: `packages/franken-web/src/pages/beast-dispatch-page.tsx`

**Step 1: Write the failing test**

Extend `packages/franken-web/tests/components/beast-dispatch-page.test.tsx` with a test that:

- enters `C:\\fakepath\\2026-03-08-productivity-integrations-implementation-plan.md` for `designDocPath`
- enters a valid `outputDir`
- clicks `Launch Design Doc -> Chunk Creation`
- expects an inline validation error like `Browser file pickers cannot provide a server path. Enter a repo path manually.`
- expects `onDispatch` not to be called

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace @frankenbeast/web test -- beast-dispatch-page.test.tsx
```

Expected: FAIL because the current validator accepts `C:\fakepath\...` as a normal file path.

**Step 3: Write minimal implementation**

Update `packages/franken-web/src/pages/beast-dispatch-page.tsx` to:

- detect browser fake paths for `file` prompts
- reject them during validation
- keep `chunk-plan` path entry as plain text instead of treating the browser picker as a valid source of backend path data

Do not add upload behavior.

**Step 4: Run test to verify it passes**

Run:

```bash
npm --workspace @frankenbeast/web test -- beast-dispatch-page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/franken-web/tests/components/beast-dispatch-page.test.tsx packages/franken-web/src/pages/beast-dispatch-page.tsx
git commit -m "fix: reject browser fakepaths in beast dispatch"
```

### Task 2: Change The Dashboard Form To Text Path Inputs For Chunk Planning

**Files:**
- Modify: `packages/franken-web/src/pages/beast-dispatch-page.tsx`
- Modify: `packages/franken-web/tests/components/beast-dispatch-page.test.tsx`
- Modify: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Write the failing test**

Add or update tests to assert that the `chunk-plan` card:

- renders plain text inputs for `designDocPath` and `outputDir`
- does not depend on the browser file picker to populate `designDocPath`
- still dispatches `/plan --design-doc docs/plans/design.md` when the operator types valid paths manually

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace @frankenbeast/web test -- beast-dispatch-page.test.tsx chat-shell.test.tsx
```

Expected: FAIL because the current form still renders the file-picker affordance for `kind: 'file'`.

**Step 3: Write minimal implementation**

Update `packages/franken-web/src/pages/beast-dispatch-page.tsx` so server-path prompts used by the beast dashboard are plain editable text controls. Keep validation rules for file vs directory shape, but do not expose the hidden native picker for `chunk-plan`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm --workspace @frankenbeast/web test -- beast-dispatch-page.test.tsx chat-shell.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/franken-web/src/pages/beast-dispatch-page.tsx packages/franken-web/tests/components/beast-dispatch-page.test.tsx packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "feat: use text paths for dashboard chunk planning"
```

### Task 3: Add Agent Resume API Coverage First

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/beasts/agent-service.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/beasts/beast-run-service.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/beasts/agent-init-service.test.ts`

**Step 1: Write the failing test**

Add tests that prove:

- a stopped tracked agent can be resumed
- resuming reuses the same agent id
- resuming creates a new run attempt under that agent
- invalid resume states are rejected

For route coverage, add a failing test for:

```http
POST /v1/beasts/agents/:agentId/resume
```

expecting a successful response with the resumed run linkage.

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace franken-orchestrator test -- agent-routes.test.ts beast-run-service.test.ts agent-init-service.test.ts agent-service.test.ts
```

Expected: FAIL because no resume endpoint or tracked-agent resume orchestration exists yet.

**Step 3: Write minimal implementation**

Implement the minimal backend surface needed to satisfy the tests in:

- `packages/franken-orchestrator/src/http/routes/agent-routes.ts`
- `packages/franken-orchestrator/src/beasts/services/agent-service.ts`
- `packages/franken-orchestrator/src/beasts/services/agent-init-service.ts`
- `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts`

Likely work:

- add an agent-centric resume method
- validate the tracked agent and linked run state
- trigger a new attempt using stored config and tracked-agent linkage
- append resume lifecycle events

**Step 4: Run test to verify it passes**

Run:

```bash
npm --workspace franken-orchestrator test -- agent-routes.test.ts beast-run-service.test.ts agent-init-service.test.ts agent-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/routes/agent-routes.ts packages/franken-orchestrator/src/beasts/services/agent-service.ts packages/franken-orchestrator/src/beasts/services/agent-init-service.ts packages/franken-orchestrator/src/beasts/services/beast-run-service.ts packages/franken-orchestrator/tests/unit/beasts/agent-service.test.ts packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts packages/franken-orchestrator/tests/unit/beasts/beast-run-service.test.ts packages/franken-orchestrator/tests/unit/beasts/agent-init-service.test.ts
git commit -m "feat: resume tracked agents with new run attempts"
```

### Task 4: Expose Pause, Resume, And Kill In The Web Client

**Files:**
- Modify: `packages/franken-web/src/lib/beast-api.ts`
- Modify: `packages/franken-web/tests/lib/beast-api.test.ts`
- Modify: `packages/franken-web/src/components/chat-shell.tsx`
- Modify: `packages/franken-web/src/pages/beast-dispatch-page.tsx`
- Modify: `packages/franken-web/tests/components/beast-dispatch-page.test.tsx`
- Modify: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Write the failing test**

Add tests to prove:

- the API client can call the new agent resume endpoint
- tracked-agent rows show `Pause` and `Resume` in the right states
- `Pause` maps to graceful stop on the linked run
- `Kill` maps to immediate kill on the linked run
- `Resume` targets the tracked agent and not a stale attempt id

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace @frankenbeast/web test -- beast-api.test.ts beast-dispatch-page.test.tsx chat-shell.test.tsx
```

Expected: FAIL because the current client only exposes run `start/stop/kill/restart`, and the current UI does not have agent-centric resume behavior.

**Step 3: Write minimal implementation**

Update the web client and dashboard to:

- add `resumeAgent(agentId)` in `packages/franken-web/src/lib/beast-api.ts`
- wire `Pause`, `Resume`, and `Kill` from `packages/franken-web/src/components/chat-shell.tsx`
- render the new lifecycle controls in `packages/franken-web/src/pages/beast-dispatch-page.tsx`
- refresh tracked-agent detail after each control action

Keep `Kill` immediate and `Pause` graceful.

**Step 4: Run test to verify it passes**

Run:

```bash
npm --workspace @frankenbeast/web test -- beast-api.test.ts beast-dispatch-page.test.tsx chat-shell.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/franken-web/src/lib/beast-api.ts packages/franken-web/tests/lib/beast-api.test.ts packages/franken-web/src/components/chat-shell.tsx packages/franken-web/src/pages/beast-dispatch-page.tsx packages/franken-web/tests/components/beast-dispatch-page.test.tsx packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "feat: add dashboard pause resume and kill controls"
```

### Task 5: Verify End-To-End Behavior

**Files:**
- Modify if needed: `packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts`
- Modify if needed: `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts`
- Modify if needed: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Add any missing failing integration coverage**

Ensure coverage exists for:

- dashboard chunk-plan manual path dispatch
- graceful stop from the dashboard
- resume producing a new attempt under the same agent
- kill remaining immediate

**Step 2: Run focused verification**

Run:

```bash
npm --workspace franken-orchestrator test -- beast-routes.test.ts agent-routes.test.ts
npm --workspace @frankenbeast/web test -- beast-api.test.ts beast-dispatch-page.test.tsx chat-shell.test.tsx
```

Expected: PASS across both packages.

**Step 3: Run package-level verification**

Run:

```bash
npm --workspace franken-orchestrator test
npm --workspace @frankenbeast/web test
```

Expected: PASS with no regressions in the touched packages.

**Step 4: Run typecheck/build verification**

Run:

```bash
npm --workspace franken-orchestrator run typecheck
npm --workspace @frankenbeast/web run typecheck
npm --workspace franken-orchestrator run build
npm --workspace @frankenbeast/web run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/beasts/beast-routes.test.ts packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "test: verify dashboard beast lifecycle controls"
```
