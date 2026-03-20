# Chunk 02: ProcessBeastExecutor — Callback Wiring to Persistence

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `ProcessSupervisor`'s new callbacks (from Chunk 01) through `ProcessBeastExecutor` to the database and log store, so process output is persisted and process exits update run/attempt status.

**Spec section:** Plan 1, Section 2

**Depends on:** Chunk 01

---

## Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (expose `notifyRunStatusChange`)
- **Extend:** `packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — the file you're modifying (111 lines)
- `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts` — updated in Chunk 01 with `ProcessCallbacks`
- `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` — has private `syncTrackedAgent` on line 129
- `packages/franken-orchestrator/src/beasts/events/beast-log-store.ts` — `append(runId, attemptId, stream, message)`
- `packages/franken-orchestrator/src/beasts/types.ts` — `BeastRunAttempt.exitCode` (line 79), `BeastRun.latestExitCode` (line 68)
- `packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts` — existing tests (97 lines)

---

## Current State

`ProcessBeastExecutor.start()` (line 26-57):
1. Calls `definition.buildProcessSpec(configSnapshot)` to get command/args/env
2. Merges module config into env as `FRANKENBEAST_MODULE_*` vars
3. Calls `supervisor.spawn(mergedSpec)` — **with one argument** (broken after Chunk 01)
4. Creates attempt with `status: 'running'`, records `attempt.started` event
5. Returns attempt — **no connection to process lifecycle after this point**

`finishAttempt()` (line 83-110):
- Updates attempt: `{ status, finishedAt, stopReason }`
- Updates run: `{ status, finishedAt, stopReason }`
- Appends event: `attempt.stopped` or `attempt.finished`
- **Does not set `exitCode`** on attempt or run (fields exist but are never populated)

The constructor takes `(repository, logs, supervisor)` — no callback for notifying the service layer.

---

## Tasks

### Task 1: Add onRunStatusChange constructor parameter

- [ ] **Step 1: Write the failing test — executor accepts onRunStatusChange callback**

Add to `tests/unit/beasts/process-beast-executor.test.ts`:

```typescript
it('accepts an onRunStatusChange callback in constructor', () => {
  const repo = new SQLiteBeastRepository(join(workDir!, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir!, 'logs'));
  const supervisor = {
    spawn: vi.fn(async (_spec: unknown, _callbacks: unknown) => ({ pid: 1234 })),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };
  const onStatusChange = vi.fn();

  const executor = new ProcessBeastExecutor(repo, logs, supervisor, onStatusChange);

  expect(executor).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/process-beast-executor.test.ts
```

Expected: FAIL — constructor only accepts 3 args.

- [ ] **Step 3: Add optional onRunStatusChange to constructor**

In `process-beast-executor.ts`, update the constructor:

```typescript
export class ProcessBeastExecutor implements BeastExecutor {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly logs: BeastLogStore,
    private readonly supervisor: ProcessSupervisorLike,
    private readonly onRunStatusChange?: (runId: string) => void,
  ) {}
```

Add the import for `BeastRunStatus` (used in handleProcessExit):

```typescript
import type { BeastDefinition, BeastRun, BeastRunAttempt, BeastRunStatus, ModuleConfig } from '../types.js';
```

**Note:** The callback signature is `(runId: string) => void`, not `(runId, status)`. The service method `notifyRunStatusChange(runId)` can be passed directly as the callback — no wrapper needed. The service looks up the run's status internally via `repository.getRun(runId)`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/process-beast-executor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts
git commit -m "feat(beasts): add onRunStatusChange callback to ProcessBeastExecutor"
```

---

### Task 2: Wire ProcessCallbacks in start()

- [ ] **Step 1: Write the failing test — spawn receives callbacks, stdout is logged**

```typescript
it('passes ProcessCallbacks to supervisor.spawn and logs stdout', async () => {
  workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
  const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir, 'logs'));

  let capturedCallbacks: { onStdout: Function; onStderr: Function; onExit: Function } | undefined;
  const supervisor = {
    spawn: vi.fn(async (_spec: unknown, callbacks: any) => {
      capturedCallbacks = callbacks;
      return { pid: 5555 };
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

  const attempt = await executor.start(run, martinLoopDefinition);

  expect(capturedCallbacks).toBeDefined();
  expect(typeof capturedCallbacks!.onStdout).toBe('function');
  expect(typeof capturedCallbacks!.onStderr).toBe('function');
  expect(typeof capturedCallbacks!.onExit).toBe('function');

  // Simulate stdout line
  capturedCallbacks!.onStdout('hello from agent');
  await new Promise((r) => setTimeout(r, 100));

  const logLines = await logs.read(run.id, attempt.id);
  expect(logLines.length).toBeGreaterThanOrEqual(2); // startup log + stdout line
  expect(logLines.some((l: string) => l.includes('hello from agent'))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/process-beast-executor.test.ts
```

Expected: FAIL — `spawn` is called with one argument, no callbacks passed.

- [ ] **Step 3: Update start() to pass callbacks to supervisor.spawn()**

In `process-beast-executor.ts`, update `start()`:

```typescript
async start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt> {
  const processSpec = definition.buildProcessSpec(run.configSnapshot);
  const moduleEnv = moduleConfigToEnv(run.configSnapshot.modules as ModuleConfig | undefined);
  const mergedSpec = {
    ...processSpec,
    env: { ...processSpec.env, ...moduleEnv },
  };

  // Stderr circular buffer (last 50 lines)
  const stderrTail: string[] = [];
  const STDERR_BUFFER_SIZE = 50;

  // Race condition note: stdout/stderr callbacks fire before attemptId is set.
  // We buffer early lines and flush after attempt creation. For lines arriving
  // before attemptId is set, they are buffered in earlyLines and flushed below.
  let attemptId: string | undefined;
  const earlyStdoutLines: string[] = [];
  const earlyStderrLines: string[] = [];

  const handle = await this.supervisor.spawn(mergedSpec, {
    onStdout: (line) => {
      if (attemptId) {
        void this.logs.append(run.id, attemptId, 'stdout', line);
      } else {
        earlyStdoutLines.push(line);
      }
    },
    onStderr: (line) => {
      stderrTail.push(line);
      if (stderrTail.length > STDERR_BUFFER_SIZE) stderrTail.shift();
      if (attemptId) {
        void this.logs.append(run.id, attemptId, 'stderr', line);
      } else {
        earlyStderrLines.push(line);
      }
    },
    onExit: (code, signal) => {
      if (attemptId) {
        this.handleProcessExit(run.id, attemptId, code, signal, [...stderrTail]);
      }
    },
  });

  const startedAt = new Date().toISOString();
  const attempt = this.repository.createAttempt(run.id, {
    status: 'running',
    pid: handle.pid,
    startedAt,
    executorMetadata: {
      backend: 'process',
      command: processSpec.command,
      args: [...processSpec.args],
    },
  });
  attemptId = attempt.id;

  // Flush any lines buffered before attemptId was set
  for (const line of earlyStdoutLines) {
    void this.logs.append(run.id, attemptId, 'stdout', line);
  }
  for (const line of earlyStderrLines) {
    void this.logs.append(run.id, attemptId, 'stderr', line);
  }

  this.repository.appendEvent(run.id, {
    attemptId: attempt.id,
    type: 'attempt.started',
    payload: {
      pid: handle.pid,
      command: processSpec.command,
    },
    createdAt: startedAt,
  });
  await this.logs.append(run.id, attempt.id, 'stdout', `started pid=${handle.pid}`);
  return attempt;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/process-beast-executor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts
git commit -m "feat(beasts): wire ProcessCallbacks in ProcessBeastExecutor.start()"
```

---

### Task 3: Implement handleProcessExit

- [ ] **Step 1: Write the failing test — process exit updates attempt and run status**

```typescript
it('handleProcessExit marks attempt as completed on exit code 0', async () => {
  workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
  const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir, 'logs'));

  let capturedCallbacks: any;
  const supervisor = {
    spawn: vi.fn(async (_spec: unknown, callbacks: any) => {
      capturedCallbacks = callbacks;
      return { pid: 6666 };
    }),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };

  const onStatusChange = vi.fn();
  const executor = new ProcessBeastExecutor(repo, logs, supervisor, onStatusChange);
  const run = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
    dispatchedBy: 'cli',
    dispatchedByUser: 'pfk',
    createdAt: new Date().toISOString(),
  });

  const attempt = await executor.start(run, martinLoopDefinition);

  // Simulate process exit with code 0
  capturedCallbacks.onExit(0, null);
  await new Promise((r) => setTimeout(r, 100));

  const updatedAttempt = repo.getAttempt(attempt.id);
  expect(updatedAttempt?.status).toBe('completed');
  expect(updatedAttempt?.exitCode).toBe(0);
  expect(updatedAttempt?.finishedAt).toBeDefined();

  const updatedRun = repo.getRun(run.id);
  expect(updatedRun?.status).toBe('completed');
  expect(updatedRun?.latestExitCode).toBe(0);

  expect(onStatusChange).toHaveBeenCalledWith(run.id);
});

it('handleProcessExit marks attempt as failed on non-zero exit code', async () => {
  workDir = await mkdtemp(join(tmpdir(), 'franken-beast-executor-'));
  const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
  const logs = new BeastLogStore(join(workDir, 'logs'));

  let capturedCallbacks: any;
  const supervisor = {
    spawn: vi.fn(async (_spec: unknown, callbacks: any) => {
      capturedCallbacks = callbacks;
      return { pid: 7777 };
    }),
    stop: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
  };

  const onStatusChange = vi.fn();
  const executor = new ProcessBeastExecutor(repo, logs, supervisor, onStatusChange);
  const run = repo.createRun({
    definitionId: 'martin-loop',
    definitionVersion: 1,
    executionMode: 'process',
    configSnapshot: { provider: 'claude', objective: 'test', chunkDirectory: './chunks' },
    dispatchedBy: 'cli',
    dispatchedByUser: 'pfk',
    createdAt: new Date().toISOString(),
  });

  const attempt = await executor.start(run, martinLoopDefinition);

  // Simulate stderr then exit code 1
  capturedCallbacks.onStderr('Error: something broke');
  capturedCallbacks.onExit(1, null);
  await new Promise((r) => setTimeout(r, 100));

  const updatedAttempt = repo.getAttempt(attempt.id);
  expect(updatedAttempt?.status).toBe('failed');
  expect(updatedAttempt?.exitCode).toBe(1);

  const updatedRun = repo.getRun(run.id);
  expect(updatedRun?.status).toBe('failed');
  expect(updatedRun?.latestExitCode).toBe(1);

  // Verify failure event was recorded with stderr tail
  const events = repo.listEvents(run.id);
  const failEvent = events.find((e: any) => e.type === 'attempt.failed');
  expect(failEvent).toBeDefined();
  expect(failEvent?.payload).toMatchObject({
    exitCode: 1,
    lastStderrLines: ['Error: something broke'],
  });

  expect(onStatusChange).toHaveBeenCalledWith(run.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/process-beast-executor.test.ts
```

Expected: FAIL — `handleProcessExit` doesn't exist.

- [ ] **Step 3: Implement handleProcessExit**

Add to `ProcessBeastExecutor` class:

```typescript
private handleProcessExit(
  runId: string,
  attemptId: string,
  code: number | null,
  signal: string | null,
  stderrTail: string[],
): void {
  const status: BeastRunStatus = code === 0 ? 'completed' : 'failed';
  const stopReason = code === 0
    ? undefined
    : signal
      ? `signal_${signal}`
      : `exit_code_${code}`;
  const finishedAt = new Date().toISOString();

  const attempt = this.repository.getAttempt(attemptId);
  if (!attempt) return;

  // Single updateAttempt call with all fields (UpdateAttemptPatch supports exitCode)
  this.repository.updateAttempt(attemptId, {
    status,
    finishedAt,
    exitCode: code ?? undefined,
    ...(stopReason ? { stopReason } : {}),
  });

  // Single updateRun call with all fields (UpdateRunPatch supports latestExitCode)
  this.repository.updateRun(runId, {
    status,
    finishedAt,
    latestExitCode: code ?? undefined,
    ...(stopReason ? { stopReason } : {}),
  });

  // Append structured event
  const eventType = code === 0 ? 'attempt.finished' : 'attempt.failed';
  this.repository.appendEvent(runId, {
    attemptId,
    type: eventType,
    payload: {
      exitCode: code,
      signal,
      ...(code !== 0 ? { lastStderrLines: stderrTail, summary: `Process exited with code ${code}` } : {}),
    },
    createdAt: finishedAt,
  });

  // Notify service layer (passes runId only — service looks up status internally)
  this.onRunStatusChange?.(runId);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/process-beast-executor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts
git commit -m "feat(beasts): implement handleProcessExit with exitCode recording and status notification"
```

---

### Task 4: Expose notifyRunStatusChange on BeastRunService

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/services/beast-run-service-notify.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BeastRunService } from '../../../../src/beasts/services/beast-run-service.js';

describe('BeastRunService.notifyRunStatusChange', () => {
  it('exposes notifyRunStatusChange as a public method', () => {
    // Minimal mock to check method exists
    const service = Object.create(BeastRunService.prototype);
    expect(typeof service.notifyRunStatusChange).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/services/beast-run-service-notify.test.ts
```

Expected: FAIL — method doesn't exist.

- [ ] **Step 3: Add public notifyRunStatusChange to BeastRunService**

In `beast-run-service.ts`, add a public method that wraps `syncTrackedAgent`:

```typescript
/** Called by ProcessBeastExecutor when a run changes status (exit/fail). */
notifyRunStatusChange(runId: string): void {
  const run = this.repository.getRun(runId);
  if (run) {
    this.syncTrackedAgent(run);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/services/beast-run-service-notify.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/services/beast-run-service.ts packages/franken-orchestrator/tests/unit/beasts/services/beast-run-service-notify.test.ts
git commit -m "feat(beasts): expose notifyRunStatusChange on BeastRunService"
```

---

### Task 5: Verify full test suite

- [ ] **Step 1: Run all orchestrator tests**

```bash
cd packages/franken-orchestrator && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

```bash
cd packages/franken-orchestrator && npx tsc --noEmit
```

Expected: Clean (no type errors).

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(beasts): resolve any type/test issues from executor callback wiring"
```

---

## Success Criteria

1. `ProcessBeastExecutor.start()` passes `ProcessCallbacks` to `supervisor.spawn()`
2. `onStdout` → `logs.append(runId, attemptId, 'stdout', line)`
3. `onStderr` → `logs.append(runId, attemptId, 'stderr', line)` + circular buffer (last 50 lines)
4. `onExit(0, null)` → attempt status `completed`, run status `completed`, `exitCode: 0`, `attempt.finished` event
5. `onExit(1, null)` → attempt status `failed`, run status `failed`, `exitCode: 1`, `attempt.failed` event with `lastStderrLines`
6. `onRunStatusChange` callback fires after DB update
7. `BeastRunService.notifyRunStatusChange()` is public and wraps `syncTrackedAgent`
8. All existing tests pass

## Verification

```bash
cd packages/franken-orchestrator && npx vitest run
cd packages/franken-orchestrator && npx tsc --noEmit
```
