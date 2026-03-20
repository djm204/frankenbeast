# Chunk 01: ProcessSupervisor — Exit Handling + Output Capture

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ProcessSupervisor.spawn()` capture stdout/stderr line-by-line, fire exit callbacks, and retain `ChildProcess` references internally for reliable stop/kill.

**Spec section:** Plan 1, Section 1

---

## Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts` — the file you're modifying
- `packages/franken-orchestrator/src/beasts/types.ts:32-37` — `BeastProcessSpec` interface
- `packages/franken-orchestrator/src/beasts/execution/beast-executor.ts` — `BeastExecutor` interface (consumer of supervisor)
- `packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts` — existing test patterns and mock shape

---

## Current State

`ProcessSupervisor` (`process-supervisor.ts`) has three methods:

1. `spawn(spec)` — calls `node:child_process/spawn()`, extracts `pid`, returns `{ pid }`. The `ChildProcess` object is **discarded**. No `on('exit')`, no `stdout.on('data')`, no `stderr.on('data')`. Despite `stdio: ['ignore', 'pipe', 'pipe']`, all output is lost.

2. `stop(pid)` — calls `process.kill(pid, 'SIGTERM')`. Uses the PID directly, which has a PID reuse risk.

3. `kill(pid)` — calls `process.kill(pid, 'SIGKILL')`. Same PID reuse risk.

The `ProcessSupervisorLike` interface on line 8 defines:
```typescript
interface ProcessSupervisorLike {
  spawn(spec: BeastProcessSpec): Promise<SpawnedProcessHandle>;
  stop(pid: number): Promise<void>;
  kill(pid: number): Promise<void>;
}
```

---

## Tasks

### Task 1: Add ProcessCallbacks interface and update ProcessSupervisorLike

- [ ] **Step 1: Write the failing test — spawn calls onExit when process exits**

Create `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProcessSupervisor } from '../../../../src/beasts/execution/process-supervisor.js';

describe('ProcessSupervisor', () => {
  it('calls onExit callback when spawned process exits', async () => {
    const supervisor = new ProcessSupervisor();

    const { code, signal } = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      supervisor.spawn(
        {
          command: process.execPath,
          args: ['-e', 'process.exit(42)'],
        },
        {
          onStdout: () => {},
          onStderr: () => {},
          onExit: (code, signal) => resolve({ code, signal }),
        },
      );
    });

    expect(code).toBe(42);
    expect(signal).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: FAIL — `spawn` does not accept a second argument.

- [ ] **Step 3: Add `ProcessCallbacks` interface and update `ProcessSupervisorLike`**

In `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`, add the import for `readline` at the top and define the callbacks interface:

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { BeastProcessSpec } from '../types.js';

export interface ProcessCallbacks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

export interface SpawnedProcessHandle {
  readonly pid: number;
}

export interface ProcessSupervisorLike {
  spawn(spec: BeastProcessSpec, callbacks: ProcessCallbacks): Promise<SpawnedProcessHandle>;
  stop(pid: number): Promise<void>;
  kill(pid: number): Promise<void>;
}
```

- [ ] **Step 4: Implement spawn with callbacks and internal process registry**

Replace the `ProcessSupervisor` class body:

```typescript
/** Filter out CLAUDE_* env vars to prevent plugin/hook interference in spawned processes. */
function stripClaudeEnvVars(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const filtered: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('CLAUDE')) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export class ProcessSupervisor implements ProcessSupervisorLike {
  private readonly processes = new Map<number, ChildProcess>();

  async spawn(spec: BeastProcessSpec, callbacks: ProcessCallbacks): Promise<SpawnedProcessHandle> {
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: {
        ...stripClaudeEnvVars(process.env),
        ...spec.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error(`Failed to spawn Beast process for command: ${spec.command}`);
    }

    this.processes.set(child.pid, child);

    if (child.stdout) {
      const stdoutRl = createInterface({ input: child.stdout });
      stdoutRl.on('line', (line) => callbacks.onStdout(line));
    }

    if (child.stderr) {
      const stderrRl = createInterface({ input: child.stderr });
      stderrRl.on('line', (line) => callbacks.onStderr(line));
    }

    child.on('exit', (code, signal) => {
      this.processes.delete(child.pid!);
      callbacks.onExit(code, signal);
    });

    return { pid: child.pid };
  }

  async stop(pid: number): Promise<void> {
    const child = this.processes.get(pid);
    if (child) {
      child.kill('SIGTERM');
      return;
    }
    // Fallback to PID-based kill for processes not in registry
    if (pid <= 0) return;
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  async kill(pid: number): Promise<void> {
    const child = this.processes.get(pid);
    if (child) {
      child.kill('SIGKILL');
      return;
    }
    if (pid <= 0) return;
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts
git commit -m "feat(beasts): add ProcessCallbacks to ProcessSupervisor.spawn()"
```

---

### Task 2: Test stdout/stderr line-buffered capture

- [ ] **Step 1: Write the failing test — stdout lines are captured**

Add to the test file:

```typescript
it('captures stdout lines via onStdout callback', async () => {
  const supervisor = new ProcessSupervisor();
  const lines: string[] = [];

  await new Promise<void>((resolve) => {
    supervisor.spawn(
      {
        command: process.execPath,
        args: ['-e', 'console.log("line1"); console.log("line2");'],
      },
      {
        onStdout: (line) => lines.push(line),
        onStderr: () => {},
        onExit: () => resolve(),
      },
    );
  });

  expect(lines).toEqual(['line1', 'line2']);
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: PASS (implementation already handles this from Task 1).

- [ ] **Step 3: Write the test — stderr lines are captured**

Add to the test file:

```typescript
it('captures stderr lines via onStderr callback', async () => {
  const supervisor = new ProcessSupervisor();
  const lines: string[] = [];

  await new Promise<void>((resolve) => {
    supervisor.spawn(
      {
        command: process.execPath,
        args: ['-e', 'console.error("err1"); console.error("err2");'],
      },
      {
        onStdout: () => {},
        onStderr: (line) => lines.push(line),
        onExit: () => resolve(),
      },
    );
  });

  expect(lines).toEqual(['err1', 'err2']);
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts
git commit -m "test(beasts): add stdout/stderr capture tests for ProcessSupervisor"
```

---

### Task 3: Test internal process registry for stop/kill

- [ ] **Step 1: Write the failing test — stop uses ChildProcess handle**

```typescript
it('stops a process using the internal registry (not PID)', async () => {
  const supervisor = new ProcessSupervisor();
  const exitPromise = new Promise<void>((resolve) => {
    supervisor.spawn(
      {
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 60000)'], // long-running
      },
      {
        onStdout: () => {},
        onStderr: () => {},
        onExit: () => resolve(),
      },
    ).then((handle) => supervisor.stop(handle.pid));
  });

  await exitPromise;
  // If we get here, the process exited after stop — test passes
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: PASS

- [ ] **Step 3: Write the test — kill uses ChildProcess handle**

```typescript
it('kills a process using the internal registry', async () => {
  const supervisor = new ProcessSupervisor();

  const { signal } = await new Promise<{ signal: string | null }>((resolve) => {
    supervisor.spawn(
      {
        command: process.execPath,
        args: ['-e', 'process.on("SIGTERM", () => {}); setTimeout(() => {}, 60000)'], // ignores SIGTERM
      },
      {
        onStdout: () => {},
        onStderr: () => {},
        onExit: (_code, sig) => resolve({ signal: sig }),
      },
    ).then((handle) => supervisor.kill(handle.pid));
  });

  expect(signal).toBe('SIGKILL');
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts
git commit -m "test(beasts): add stop/kill registry tests for ProcessSupervisor"
```

---

### Task 4: Fix existing tests and verify full suite

- [ ] **Step 1: Update mock supervisor in existing ProcessBeastExecutor tests**

The existing test file `tests/unit/beasts/process-beast-executor.test.ts` mocks the supervisor with `spawn: vi.fn(async () => ({ pid: 4242 }))`. This mock must be updated to accept (and ignore) the callbacks parameter:

```typescript
// In the supervisor mock, spawn already accepts any args via vi.fn() —
// but verify ProcessBeastExecutor.start() now passes callbacks.
// This will be addressed in Chunk 02 when ProcessBeastExecutor is updated.
// For now, the mock's vi.fn() signature naturally accepts extra args.
```

Check that existing tests still pass with the updated `ProcessSupervisorLike` interface. The mock created with `vi.fn()` is flexible enough to accept any arguments, so no changes should be needed yet.

- [ ] **Step 2: Run the full orchestrator test suite**

```bash
cd packages/franken-orchestrator && npx vitest run
```

Expected: Some tests in `process-beast-executor.test.ts` may fail because `ProcessBeastExecutor.start()` still calls `supervisor.spawn(mergedSpec)` with one argument. The interface now requires two. **This is expected** — Chunk 02 fixes it. For now, the `vi.fn()` mock accepts any arity, so the mock-based tests should still pass. The TypeScript compiler will flag the mismatch at typecheck time.

- [ ] **Step 3: Run typecheck to identify expected breakage**

```bash
cd packages/franken-orchestrator && npx tsc --noEmit 2>&1 | head -30
```

Expected: Type error in `process-beast-executor.ts` line 33 — `spawn` now requires callbacks as second argument. This is the expected breakage that Chunk 02 resolves.

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts
git commit -m "chore(beasts): checkpoint — ProcessSupervisor updated, executor fix in next chunk"
```

---

## Success Criteria

1. `ProcessSupervisor.spawn()` accepts `ProcessCallbacks` and fires `onStdout`, `onStderr`, `onExit`
2. Output is line-buffered via `readline.createInterface()`
3. Internal `Map<number, ChildProcess>` used for `stop()` and `kill()` instead of `process.kill(pid)`
4. `ProcessSupervisorLike` interface updated to match
5. All new tests pass
6. Existing mock-based executor tests still pass (mocks accept extra args)

## Verification

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/execution/process-supervisor.test.ts
```
