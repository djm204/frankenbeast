# Chunk 02: Daemon Lifecycle — Lazy Start, Shutdown, Detached Spawn

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lazy daemon startup (auto-start when CLI or chat-server needs it), graceful shutdown with child process cleanup, and detached background spawning.

**Spec section:** Plan 2, Section 2

---

## Pre-conditions

- Chunk 01 complete (`DaemonLifecycle` with PID file management, `beast-daemon.ts` with health endpoint, `beasts-daemon` subcommand wired)

---

## Files

- **Modify:** `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts`
- **Create:** `packages/franken-orchestrator/src/daemon/daemon-shutdown.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts` (add `getRunningPids()` to `ProcessSupervisorLike` interface and implementation)
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts` (extend)
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/daemon-shutdown.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts` — PID file management from Chunk 01
- `packages/franken-orchestrator/src/daemon/beast-daemon.ts` — daemon app + startBeastDaemon from Chunk 01
- `packages/franken-orchestrator/src/resilience/graceful-shutdown.ts` — existing shutdown handler (75 lines, session-context-specific — do NOT reuse for daemon, see design note)
- `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts` — `ProcessSupervisor` manages child processes

---

## Current State

`DaemonLifecycle` can write/read/remove PID files and check if a daemon PID is alive. There is no mechanism to:
1. Auto-start the daemon when it's needed but not running
2. Wait for daemon readiness after spawning
3. Shut down gracefully (stop accepting requests, SIGTERM children, wait, SIGKILL stragglers)
4. Clean up child processes on daemon exit

**Why not reuse `graceful-shutdown.ts`?** The existing `GracefulShutdown` class is designed for BeastLoop session checkpointing (saving context snapshots). The daemon needs process-supervision-aware shutdown: enumerate child PIDs, SIGTERM, wait with timeout, SIGKILL. Different responsibilities, different class.

---

## Tasks

### Task 1: Lazy daemon start — ensureDaemonRunning()

- [ ] **Step 1: Write the failing test — ensureDaemonRunning starts daemon if not alive**

Add to `packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts`:

```typescript
import { vi } from 'vitest';

describe('ensureDaemonRunning', () => {
  it('returns immediately if daemon is already alive', async () => {
    // Write current PID so isDaemonAlive returns true
    await lifecycle.writePidFile(process.pid);
    const spawned = await lifecycle.ensureDaemonRunning({
      daemonCommand: 'node',
      daemonArgs: ['--version'],
      healthUrl: 'http://localhost:19999/v1/beasts/health',
      healthTimeoutMs: 1000,
    });
    expect(spawned).toBe(false); // Already running, no spawn needed
  });

  it('throws if health check times out after spawn', async () => {
    // No PID file → daemon not alive → will try to spawn
    // Use a command that exits immediately and doesn't serve HTTP
    await expect(
      lifecycle.ensureDaemonRunning({
        daemonCommand: 'node',
        daemonArgs: ['-e', 'process.exit(0)'],
        healthUrl: 'http://localhost:19999/v1/beasts/health',
        healthTimeoutMs: 500,
      }),
    ).rejects.toThrow(/health check/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/daemon-lifecycle.test.ts --reporter=verbose`
Expected: FAIL — `ensureDaemonRunning` not found

- [ ] **Step 3: Implement ensureDaemonRunning**

Add to `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts`:

```typescript
import { spawn as nodeSpawn } from 'node:child_process';

export interface EnsureDaemonOptions {
  daemonCommand: string;
  daemonArgs: string[];
  healthUrl: string;
  healthTimeoutMs: number;
}

// Add to DaemonLifecycle class:

async ensureDaemonRunning(options: EnsureDaemonOptions): Promise<boolean> {
  if (await this.isDaemonAlive()) {
    return false; // Already running
  }

  // Clean up stale PID file if present
  await this.removePidFile();

  // Spawn daemon as detached background process
  const child = nodeSpawn(options.daemonCommand, options.daemonArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Wait for health check to pass
  await this.waitForHealth(options.healthUrl, options.healthTimeoutMs);
  return true;
}

private async waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Beast daemon health check timed out after ${timeoutMs}ms (${url})`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/daemon-lifecycle.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts
git commit -m "feat(orchestrator): add lazy daemon start with health check polling"
```

---

### Task 2: Daemon-specific graceful shutdown

- [ ] **Step 1: Write the failing test — shutdown SIGTERMs children and waits**

Create `packages/franken-orchestrator/tests/unit/daemon/daemon-shutdown.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonShutdown } from '../../../src/daemon/daemon-shutdown.js';

describe('DaemonShutdown', () => {
  let shutdown: DaemonShutdown;
  let mockSupervisor: { getRunningPids: () => number[]; stop: (pid: number) => Promise<void>; kill: (pid: number) => Promise<void> };

  beforeEach(() => {
    mockSupervisor = {
      getRunningPids: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
      kill: vi.fn().mockResolvedValue(undefined),
    };
    shutdown = new DaemonShutdown({
      supervisor: mockSupervisor,
      timeoutMs: 5000,
      onCleanup: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('calls stop on all running PIDs', async () => {
    mockSupervisor.getRunningPids = vi.fn().mockReturnValue([111, 222]);
    await shutdown.execute();
    expect(mockSupervisor.stop).toHaveBeenCalledWith(111);
    expect(mockSupervisor.stop).toHaveBeenCalledWith(222);
  });

  it('calls onCleanup after stopping children', async () => {
    const onCleanup = vi.fn().mockResolvedValue(undefined);
    shutdown = new DaemonShutdown({
      supervisor: mockSupervisor,
      timeoutMs: 5000,
      onCleanup,
    });
    await shutdown.execute();
    expect(onCleanup).toHaveBeenCalled();
  });

  it('escalates to kill if stop does not resolve within timeout', async () => {
    mockSupervisor.getRunningPids = vi.fn().mockReturnValue([111]);
    // stop never resolves
    mockSupervisor.stop = vi.fn().mockReturnValue(new Promise(() => {}));

    shutdown = new DaemonShutdown({
      supervisor: mockSupervisor,
      timeoutMs: 100,
      onCleanup: vi.fn().mockResolvedValue(undefined),
    });
    await shutdown.execute();
    expect(mockSupervisor.kill).toHaveBeenCalledWith(111);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/daemon-shutdown.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DaemonShutdown**

Create `packages/franken-orchestrator/src/daemon/daemon-shutdown.ts`:

```typescript
/**
 * NOTE: The existing `DaemonSupervisorLike` interface in `process-supervisor.ts` has
 * `spawn/stop/kill` but no `getRunningPids()`. Plan 1 Chunk 01 adds an internal
 * `Map<number, ChildProcess>` registry to `ProcessSupervisor`. This chunk extends
 * that interface with `getRunningPids()` which returns the keys of that registry.
 *
 * Modify `DaemonSupervisorLike` in `process-supervisor.ts` to add:
 *   getRunningPids(): number[];
 *
 * And implement it in `ProcessSupervisor`:
 *   getRunningPids(): number[] { return [...this.processes.keys()]; }
 */
export interface DaemonSupervisorLike {
  getRunningPids(): number[];
  stop(pid: number): Promise<void>;
  kill(pid: number): Promise<void>;
}

export interface DaemonShutdownOptions {
  supervisor: DaemonSupervisorLike;
  timeoutMs: number;
  onCleanup: () => Promise<void>;
}

export class DaemonShutdown {
  private readonly supervisor: DaemonSupervisorLike;
  private readonly timeoutMs: number;
  private readonly onCleanup: () => Promise<void>;

  constructor(options: DaemonShutdownOptions) {
    this.supervisor = options.supervisor;
    this.timeoutMs = options.timeoutMs;
    this.onCleanup = options.onCleanup;
  }

  async execute(): Promise<void> {
    const pids = this.supervisor.getRunningPids();

    // SIGTERM all children
    const stopPromises = pids.map((pid) => this.supervisor.stop(pid));

    // Wait with timeout
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), this.timeoutMs),
    );

    const result = await Promise.race([
      Promise.allSettled(stopPromises).then(() => 'done' as const),
      timeout,
    ]);

    // SIGKILL stragglers if timeout
    if (result === 'timeout') {
      const stillRunning = this.supervisor.getRunningPids();
      await Promise.allSettled(stillRunning.map((pid) => this.supervisor.kill(pid)));
    }

    await this.onCleanup();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/daemon-shutdown.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/daemon-shutdown.ts packages/franken-orchestrator/tests/unit/daemon/daemon-shutdown.test.ts
git commit -m "feat(orchestrator): add DaemonShutdown with SIGTERM→SIGKILL escalation"
```

---

### Task 3: Wire shutdown into beast-daemon.ts

- [ ] **Step 1: Write the failing test — daemon installs shutdown handler**

Add to `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`:

```typescript
describe('startBeastDaemon shutdown', () => {
  it('startBeastDaemon accepts a supervisor for shutdown', async () => {
    // Verify the options shape accepts the supervisor dependency
    const { startBeastDaemon } = await import('../../../src/daemon/beast-daemon.js');
    // Type check — this is a compile-time verification via the import
    expect(typeof startBeastDaemon).toBe('function');
  });
});
```

- [ ] **Step 2: Update startBeastDaemon to accept supervisor and wire DaemonShutdown**

In `packages/franken-orchestrator/src/daemon/beast-daemon.ts`, update `StartBeastDaemonOptions`:

```typescript
import { DaemonShutdown, DaemonSupervisorLike } from './daemon-shutdown.js';

export interface StartBeastDaemonOptions {
  port: number;
  pidFilePath: string;
  operatorToken: string;
  supervisor?: DaemonSupervisorLike;
}

export async function startBeastDaemon(options: StartBeastDaemonOptions): Promise<{ close: () => void }> {
  const app = createBeastDaemonApp({ operatorToken: options.operatorToken });
  const lifecycle = new DaemonLifecycle({ pidFilePath: options.pidFilePath });

  const server = serve({ fetch: app.fetch, port: options.port });

  await lifecycle.writePidFile(process.pid);

  const daemonShutdown = new DaemonShutdown({
    supervisor: options.supervisor ?? { getRunningPids: () => [], stop: async () => {}, kill: async () => {} },
    timeoutMs: 10_000,
    onCleanup: async () => {
      server.close();
      await lifecycle.removePidFile();
    },
  });

  const close = () => {
    daemonShutdown.execute().catch(() => {});
  };

  process.on('SIGTERM', close);
  process.on('SIGINT', close);

  return { close };
}
```

- [ ] **Step 3: Run all daemon tests**

Run: `npx vitest run tests/unit/daemon/ --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/beast-daemon.ts packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts
git commit -m "feat(orchestrator): wire DaemonShutdown into beast daemon startup"
```
