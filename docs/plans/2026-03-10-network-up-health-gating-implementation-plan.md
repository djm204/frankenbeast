# Network Up Health Gating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `frankenbeast network up` port-aware and health-aware so it reuses safe managed services, fails clearly on conflicts, and only reports success after services are actually running.

**Architecture:** Extend the network service runtime model with managed startup metadata, add preflight/health gating to the supervisor, and update CLI output semantics so the operator becomes the single authoritative startup surface. Keep the existing process model; do not switch to in-process service hosting.

**Tech Stack:** TypeScript, Node child processes, existing network supervisor/state store, Vitest.

---

### Task 1: Add failing supervisor and CLI tests for startup gating

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/network/network-supervisor.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/network-run.test.ts`

**Step 1: Write failing tests**

Add tests for:

- `network up` reuses a healthy managed service instead of respawning it
- `network up` fails when a conflicting unmanaged listener owns the configured port
- `network up` does not print `Started ...` until the supervisor reports health
- startup failure stops services that were newly started earlier in the same run

**Step 2: Run them to verify failure**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-supervisor.test.ts tests/unit/cli/network-run.test.ts
```

Expected: FAIL because the current supervisor still treats spawn as immediate success.

### Task 2: Add runtime metadata and preflight hooks

**Files:**
- Modify: `packages/franken-orchestrator/src/network/network-registry.ts`
- Modify: `packages/franken-orchestrator/src/network/services/chat-server-service.ts`
- Modify: `packages/franken-orchestrator/src/network/services/dashboard-web-service.ts`
- Modify: `packages/franken-orchestrator/src/network/network-state-store.ts`

**Step 1: Implement minimal runtime metadata**

Add enough metadata to describe:

- expected host/port
- health URL
- managed identity
- whether banner suppression should apply

### Task 3: Implement supervisor startup gating

**Files:**
- Modify: `packages/franken-orchestrator/src/network/network-supervisor.ts`
- Modify: `packages/franken-orchestrator/src/network/network-health.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`

**Step 1: Implement preflight and reuse logic**

Add:

- preflight port checks
- managed-service reuse detection
- health polling after spawn
- rollback of partially started services on failure

**Step 2: Re-run the targeted tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-supervisor.test.ts tests/unit/cli/network-run.test.ts
```

Expected: PASS

### Task 4: Suppress managed child banners and unify version display

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/logging/beast-logger.ts`
- Modify: `packages/franken-orchestrator/src/network/services/chat-server-service.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`

**Step 1: Add failing output tests**

Add coverage for managed child execution paths so the child banner is skipped under network supervision.

**Step 2: Implement minimal behavior**

Use an env flag for network-managed child launches and make the banner renderer prefer the root Frankenbeast version in that mode.

### Task 5: Full verification and commit

**Files:**
- Verify only

**Step 1: Run verification**

```bash
npm --workspace franken-orchestrator test
npm --workspace franken-orchestrator run typecheck
npm --workspace franken-comms run build
git diff --check
```

**Step 2: Commit**

```bash
git add docs/plans/2026-03-10-network-up-health-gating-design.md docs/plans/2026-03-10-network-up-health-gating-implementation-plan.md packages/franken-orchestrator
git commit -m "fix(network): gate startup on health and port ownership"
```
