# Chunk 05: Error Reporting to Dashboard

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that when a spawned agent fails, the dashboard shows structured error info — exit code, last stderr lines, and correct status — instead of stale "running" forever. Also add SIGTERM timeout escalation to SIGKILL.

**Spec section:** Plan 1, Section 5

**Depends on:** Chunk 02 (handleProcessExit already does the core work — this chunk adds agent-level events, spawn failure handling, and SIGTERM timeout)

---

## Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (syncTrackedAgent enhancements)
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/execution/error-reporting.test.ts`
- **Create:** `packages/franken-orchestrator/tests/integration/beasts/agent-failure-flow.test.ts`

---

## Pre-conditions (from earlier chunks)

After Chunk 01: `ProcessSupervisorLike.spawn(spec, callbacks)` — callbacks include `onStdout`, `onStderr`, `onExit`.
After Chunk 02: `ProcessBeastExecutor` constructor is `(repository, logs, supervisor, onRunStatusChange?)`. Has `handleProcessExit()` method.
After Chunk 04: `start()` writes config file to `.frankenbeast/.build/run-configs/<runId>.json`.

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — modified in Chunks 02 + 04, has `handleProcessExit`
- `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` — `syncTrackedAgent` (line 129-151)
- `packages/franken-orchestrator/src/beasts/services/agent-service.ts` — `TrackedAgentEvent` creation
- `packages/franken-orchestrator/src/beasts/agent-types.ts` — `TrackedAgentEvent` interface
- `packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts` — `appendTrackedAgentEvent()`

---

## Current State

After Chunk 02, `handleProcessExit` already:
- Updates attempt/run status to `completed` or `failed`
- Sets `exitCode` on attempt and `latestExitCode` on run
- Appends `attempt.finished` or `attempt.failed` event with `lastStderrLines`
- Calls `onRunStatusChange` callback

What's missing:
1. **TrackedAgent events** — `syncTrackedAgent` updates agent status but doesn't append agent-level events (`agent.run.failed`, `agent.run.completed`)
2. **Spawn failure handling** — if `supervisor.spawn()` throws (ENOENT, EACCES), no cleanup happens
3. **SIGTERM timeout** — `stop()` sends SIGTERM but if the process ignores it, it stays running forever

---

## Tasks

### Task 1: Add agent-level events to syncTrackedAgent

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/execution/error-reporting.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLogStore } from '../../../../src/beasts/events/beast-log-store.js';
import { ProcessBeastExecutor } from '../../../../src/beasts/execution/process-beast-executor.js';
import { BeastRunService } from '../../../../src/beasts/services/beast-run-service.js';
import { martinLoopDefinition } from '../../../../src/beasts/definitions/martin-loop-definition.js';

describe('Error reporting to dashboard', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('appends agent.run.failed event when process exits with non-zero code', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-error-report-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));

    // Create tracked agent first
    const agent = repo.createTrackedAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      status: 'dispatching',
      createdByUser: 'pfk',
      initAction: { kind: 'martin-loop', command: 'run', config: {} },
      initConfig: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let capturedCallbacks: any;
    const supervisor = {
      spawn: vi.fn(async (_spec: any, callbacks: any) => {
        capturedCallbacks = callbacks;
        return { pid: 3333 };
      }),
      stop: vi.fn(async () => {}),
      kill: vi.fn(async () => {}),
    };

    // Wire up: service creates executor, passes notifyRunStatusChange
    const onStatusChange = vi.fn((runId: string) => {
      const run = repo.getRun(runId);
      if (!run?.trackedAgentId) return;
      // Simulate what BeastRunService.syncTrackedAgent should do
      const trackedAgent = repo.getTrackedAgent(run.trackedAgentId);
      if (!trackedAgent || trackedAgent.status === 'deleted') return;

      const status = run.status === 'completed' ? 'completed' : 'failed';
      repo.updateTrackedAgent(run.trackedAgentId, {
        status,
        updatedAt: new Date().toISOString(),
      });

      // This is what we're testing — agent-level event creation
      repo.appendTrackedAgentEvent(run.trackedAgentId, {
        level: run.status === 'failed' ? 'error' : 'info',
        type: run.status === 'failed' ? 'agent.run.failed' : 'agent.run.completed',
        message: run.status === 'failed'
          ? `Run ${runId} failed with exit code ${run.latestExitCode}`
          : `Run ${runId} completed successfully`,
        payload: {
          runId,
          exitCode: run.latestExitCode,
        },
        createdAt: new Date().toISOString(),
      });
    });

    const executor = new ProcessBeastExecutor(repo, logs, supervisor, onStatusChange);
    const run = repo.createRun({
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'pfk',
      trackedAgentId: agent.id,
      createdAt: new Date().toISOString(),
    });

    await executor.start(run, martinLoopDefinition);

    // Simulate stderr + failure
    capturedCallbacks.onStderr('Error: module not found');
    capturedCallbacks.onStderr('    at /path/to/file.ts:42');
    capturedCallbacks.onExit(1, null);
    await new Promise((r) => setTimeout(r, 200));

    // Verify agent-level event was created
    const agentEvents = repo.listTrackedAgentEvents(agent.id);
    const failEvent = agentEvents.find((e: any) => e.type === 'agent.run.failed');
    expect(failEvent).toBeDefined();
    expect(failEvent?.level).toBe('error');
    expect(failEvent?.payload).toMatchObject({
      runId: run.id,
      exitCode: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
```

Expected: Depends on whether the mock `onStatusChange` is called — the test structure validates the pattern.

- [ ] **Step 3: Update syncTrackedAgent in BeastRunService to append agent events**

In `beast-run-service.ts`, expand `syncTrackedAgent` (line 129-151):

```typescript
private syncTrackedAgent(run: BeastRun): void {
  if (!run.trackedAgentId) return;
  const trackedAgent = this.repository.getTrackedAgent(run.trackedAgentId);
  if (!trackedAgent || trackedAgent.status === 'deleted') return;

  const status = run.status === 'running'
    ? 'running'
    : run.status === 'completed'
      ? 'completed'
      : run.status === 'failed'
        ? 'failed'
        : 'stopped';

  this.repository.updateTrackedAgent(run.trackedAgentId, {
    status,
    ...(run.id ? { dispatchRunId: run.id } : {}),
    updatedAt: new Date().toISOString(),
  });

  // Append agent-level event for terminal states
  if (run.status === 'failed' || run.status === 'completed' || run.status === 'stopped') {
    const level = run.status === 'failed' ? 'error' : 'info';
    const type = `agent.run.${run.status}`;
    const message = run.status === 'failed'
      ? `Run ${run.id} failed with exit code ${run.latestExitCode ?? 'unknown'}`
      : run.status === 'completed'
        ? `Run ${run.id} completed successfully`
        : `Run ${run.id} stopped`;

    this.repository.appendTrackedAgentEvent(run.trackedAgentId, {
      level,
      type,
      message,
      payload: {
        runId: run.id,
        ...(run.latestExitCode !== undefined ? { exitCode: run.latestExitCode } : {}),
        ...(run.stopReason ? { stopReason: run.stopReason } : {}),
      },
      createdAt: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/services/beast-run-service.ts packages/franken-orchestrator/tests/unit/beasts/execution/error-reporting.test.ts
git commit -m "feat(beasts): append agent-level events on run completion/failure"
```

---

### Task 2: Handle spawn failures

- [ ] **Step 1: Write the failing test — spawn failure records event and updates run**

Add to `error-reporting.test.ts`:

```typescript
it('handles spawn failure (ENOENT) with run.spawn_failed event', async () => {
  workDir = await mkdtemp(join(tmpdir(), 'franken-spawn-fail-'));
  const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir, 'logs'));

  const supervisor = {
    spawn: vi.fn(async () => {
      throw new Error('spawn ENOENT: /nonexistent/binary');
    }),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };

  const executor = new ProcessBeastExecutor(repo, logs, supervisor);
  const run = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
    dispatchedBy: 'cli',
    dispatchedByUser: 'pfk',
    createdAt: new Date().toISOString(),
  });

  await expect(executor.start(run, martinLoopDefinition)).rejects.toThrow('ENOENT');

  // Verify spawn_failed event was recorded (no attemptId)
  const events = repo.listEvents(run.id);
  const spawnFailedEvent = events.find((e: any) => e.type === 'run.spawn_failed');
  expect(spawnFailedEvent).toBeDefined();
  expect(spawnFailedEvent?.attemptId).toBeUndefined();
  expect(spawnFailedEvent?.payload).toMatchObject({
    error: expect.stringContaining('ENOENT'),
  });

  // Run should be marked as failed
  const updatedRun = repo.getRun(run.id);
  expect(updatedRun?.status).toBe('failed');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
```

Expected: FAIL — no spawn_failed event, run not marked as failed.

- [ ] **Step 3: Add try/catch around spawn in start()**

In `process-beast-executor.ts`, wrap the `supervisor.spawn()` call:

```typescript
let handle: SpawnedProcessHandle;
try {
  handle = await this.supervisor.spawn(mergedSpec, { onStdout, onStderr, onExit });
} catch (error) {
  // Record spawn failure event (no attemptId exists yet)
  this.repository.appendEvent(run.id, {
    type: 'run.spawn_failed',
    payload: {
      error: String(error instanceof Error ? error.message : error),
      command: processSpec.command,
      args: [...processSpec.args],
    },
    createdAt: new Date().toISOString(),
  });
  this.repository.updateRun(run.id, {
    status: 'failed',
    finishedAt: new Date().toISOString(),
    stopReason: 'spawn_failed',
  });
  this.onRunStatusChange?.(run.id);
  throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/execution/error-reporting.test.ts
git commit -m "feat(beasts): handle spawn failures with run.spawn_failed event and status update"
```

---

### Task 3: SIGTERM timeout escalation to SIGKILL

- [ ] **Step 1: Write the failing test**

Add to `error-reporting.test.ts`:

```typescript
it('escalates to SIGKILL after 10s SIGTERM timeout', async () => {
  workDir = await mkdtemp(join(tmpdir(), 'franken-sigterm-timeout-'));
  const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir, 'logs'));

  let capturedCallbacks: any;
  const supervisor = {
    spawn: vi.fn(async (_spec: any, callbacks: any) => {
      capturedCallbacks = callbacks;
      return { pid: 1111 };
    }),
    stop: vi.fn(async () => {
      // SIGTERM sent but process doesn't die — onExit won't fire
    }),
    kill: vi.fn(async () => {
      // SIGKILL — process dies
      capturedCallbacks.onExit(null, 'SIGKILL');
    }),
  };

  const executor = new ProcessBeastExecutor(repo, logs, supervisor);
  const run = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
    dispatchedBy: 'dashboard',
    dispatchedByUser: 'pfk',
    createdAt: new Date().toISOString(),
  });

  const attempt = await executor.start(run, martinLoopDefinition);

  // Override the timeout to 100ms for testing
  await executor.stop(run.id, attempt.id, { timeoutMs: 100 });
  await new Promise((r) => setTimeout(r, 300));

  expect(supervisor.stop).toHaveBeenCalledWith(1111);
  expect(supervisor.kill).toHaveBeenCalledWith(1111);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
```

Expected: FAIL — `stop()` doesn't accept options, doesn't have timeout logic.

- [ ] **Step 3a: Update BeastExecutor interface to accept options on stop()**

In `packages/franken-orchestrator/src/beasts/execution/beast-executor.ts`, update the `stop` signature:

```typescript
export interface BeastExecutor {
  start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt>;
  stop(runId: string, attemptId: string, options?: { timeoutMs?: number }): Promise<BeastRunAttempt>;
  kill(runId: string, attemptId: string): Promise<BeastRunAttempt>;
}
```

Also update `ContainerBeastExecutor.stop()` if it exists (stub — just add the parameter).

Update `BeastRunService.stop()` call at line 77 to pass through (no options needed for existing behavior):
```typescript
await this.executorFor(run).stop(run.id, attemptId);
```
This already works since options is optional.

- [ ] **Step 3b: Add SIGTERM timeout escalation to stop()**

Update `stop()` in `process-beast-executor.ts`. Uses a Promise-based approach — the `onExit` callback from Chunk 02 resolves the promise when the process actually exits:

```typescript
private readonly exitPromises = new Map<string, { resolve: () => void }>();

async stop(
  runId: string,
  attemptId: string,
  options?: { timeoutMs?: number },
): Promise<BeastRunAttempt> {
  const attempt = this.requireAttempt(attemptId);
  if (attempt.pid === undefined) {
    return this.finishAttempt(runId, attempt, 'stopped', 'operator_stop');
  }

  // Create a promise that resolves when onExit fires for this attempt
  const exitPromise = new Promise<boolean>((resolve) => {
    this.exitPromises.set(attemptId, { resolve: () => resolve(true) });

    // Timeout — process didn't die
    const timeoutMs = options?.timeoutMs ?? 10_000;
    setTimeout(() => resolve(false), timeoutMs);
  });

  await this.supervisor.stop(attempt.pid);

  const exited = await exitPromise;
  this.exitPromises.delete(attemptId);

  if (!exited && attempt.pid !== undefined) {
    // Escalate to SIGKILL
    await this.supervisor.kill(attempt.pid);
    void this.logs.append(runId, attemptId, 'stderr', 'sigterm_timeout_escalated_to_sigkill');
  }

  return this.repository.getAttempt(attemptId) ?? attempt;
}
```

In `handleProcessExit`, resolve the exit promise if one exists:

```typescript
// At the end of handleProcessExit:
const pending = this.exitPromises.get(attemptId);
if (pending) pending.resolve();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/execution/error-reporting.test.ts
git commit -m "feat(beasts): add SIGTERM timeout escalation to SIGKILL on stop()"
```

---

### Task 4: Integration test — full agent failure flow

- [ ] **Step 1: Write the integration test**

Create `packages/franken-orchestrator/tests/integration/beasts/agent-failure-flow.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { ProcessBeastExecutor } from '../../../src/beasts/execution/process-beast-executor.js';
import { ProcessSupervisor } from '../../../src/beasts/execution/process-supervisor.js';
import type { BeastDefinition } from '../../../src/beasts/types.js';
import { z } from 'zod';

// Minimal definition that spawns a process that writes to stderr and exits with code 1
const failingDefinition: BeastDefinition = {
  id: 'test-failure',
  version: 1,
  label: 'Test Failure',
  description: 'For testing',
  executionModeDefault: 'process',
  configSchema: z.object({}).strict(),
  interviewPrompts: [],
  buildProcessSpec: () => ({
    command: process.execPath,
    args: ['-e', 'console.error("boom"); console.error("stack trace here"); process.exit(1)'],
  }),
  telemetryLabels: { family: 'test' },
};

describe('Agent failure flow (integration)', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('spawns a real process, captures stderr, records failure events', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-failure-flow-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const supervisor = new ProcessSupervisor();

    const statusChanges: Array<{ runId: string; status: string }> = [];
    const onStatusChange = (runId: string, status: string) => {
      statusChanges.push({ runId, status });
    };

    const executor = new ProcessBeastExecutor(repo, logs, supervisor, onStatusChange);
    const run = repo.createRun({
      definitionId: 'test-failure',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'cli',
      dispatchedByUser: 'pfk',
      createdAt: new Date().toISOString(),
    });

    const attempt = await executor.start(run, failingDefinition);
    expect(attempt.status).toBe('running');

    // Wait for process to exit
    await new Promise((r) => setTimeout(r, 2000));

    // Verify run is failed
    const updatedRun = repo.getRun(run.id);
    expect(updatedRun?.status).toBe('failed');
    expect(updatedRun?.latestExitCode).toBe(1);

    // Verify attempt has exitCode
    const updatedAttempt = repo.getAttempt(attempt.id);
    expect(updatedAttempt?.exitCode).toBe(1);

    // Verify failure event exists with stderr lines
    const events = repo.listEvents(run.id);
    const failEvent = events.find((e: any) => e.type === 'attempt.failed');
    expect(failEvent).toBeDefined();
    expect(failEvent?.payload).toMatchObject({
      exitCode: 1,
      lastStderrLines: expect.arrayContaining(['boom']),
    });

    // Verify logs contain stderr
    const logLines = await logs.read(run.id, attempt.id);
    expect(logLines.some((l: string) => l.includes('boom'))).toBe(true);
    expect(logLines.some((l: string) => l.includes('stack trace here'))).toBe(true);

    // Verify status change callback fired
    expect(statusChanges).toContainEqual({ runId: run.id, status: 'failed' });
  }, 10_000);
});
```

- [ ] **Step 2: Run the integration test**

```bash
cd packages/franken-orchestrator && npx vitest run tests/integration/beasts/agent-failure-flow.test.ts
```

Expected: PASS (this exercises the real ProcessSupervisor + ProcessBeastExecutor end-to-end).

- [ ] **Step 3: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/beasts/agent-failure-flow.test.ts
git commit -m "test(beasts): add integration test for agent failure flow"
```

---

### Task 5: Verify full test suite

- [ ] **Step 1: Run all orchestrator tests**

```bash
cd packages/franken-orchestrator && npx vitest run
```

- [ ] **Step 2: Run typecheck**

```bash
cd packages/franken-orchestrator && npx tsc --noEmit
```

Expected: Clean.

---

## Success Criteria

1. `syncTrackedAgent` appends `agent.run.failed` / `agent.run.completed` / `agent.run.stopped` events
2. Spawn failures record `run.spawn_failed` event and set run status to `failed`
3. `stop()` escalates to SIGKILL after timeout (default 10s)
4. Integration test passes: real process spawned, stderr captured, failure events recorded
5. All existing tests pass

## Verification

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/error-reporting.test.ts
cd packages/franken-orchestrator && npx vitest run tests/integration/beasts/agent-failure-flow.test.ts
cd packages/franken-orchestrator && npx vitest run
```
