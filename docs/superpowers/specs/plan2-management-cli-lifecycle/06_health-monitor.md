# Chunk 06: Health Monitor — Liveness Probing + Stale Process Detection

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add periodic health monitoring for spawned agent processes: PID liveness checks, heartbeat file validation, stale process cleanup on daemon startup.

**Spec section:** Plan 2, Section 4

---

## Pre-conditions

- Chunk 01 complete (daemon exists with lifecycle management)
- Chunk 04 complete (routes mounted in daemon, beast services available)

---

## Files

- **Create:** `packages/franken-orchestrator/src/beasts/execution/health-monitor.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (heartbeat env vars)
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (add `getRunningAttempts()`, `markAttemptStale()`)
- **Modify:** `packages/franken-orchestrator/src/beasts/repository/sqlite-beast-repository.ts` (add repository queries for running attempts and stale marking)
- **Modify:** `packages/franken-orchestrator/src/cli/session.ts` (heartbeat file touch)
- **Modify:** `packages/franken-orchestrator/src/daemon/beast-daemon.ts` (startup scan)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/health-monitor.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — executor that spawns processes (111 lines + Plan 1 changes)
- `packages/franken-orchestrator/src/beasts/types.ts` — `BeastRun.lastHeartbeatAt` (already in type), `BeastRunAttempt` type
- `packages/franken-orchestrator/src/cli/session.ts` — `Session` class (484 lines), `start()` at line 75
- `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` — `BeastRunService` (152 lines), `syncTrackedAgent` at line 129

---

## Current State

No health monitoring exists. If a spawned process dies without the exit handler firing (e.g., SIGKILL, segfault), the run stays in `running` status forever. `BeastRun.lastHeartbeatAt` is defined in the type but never populated.

---

## Tasks

### Task 1: Create HealthMonitor with PID liveness checking

- [ ] **Step 1: Write the failing test — detects dead process**

Create `packages/franken-orchestrator/tests/unit/beasts/execution/health-monitor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor } from '../../../../src/beasts/execution/health-monitor.js';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let mockRunService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockRunService = {
      getRunningAttempts: vi.fn().mockResolvedValue([]),
      markAttemptStale: vi.fn().mockResolvedValue(undefined),
    };
    monitor = new HealthMonitor({
      runService: mockRunService as any,
      intervalMs: 100, // Fast for testing
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('detects dead process and marks attempt as stale', async () => {
    mockRunService.getRunningAttempts.mockResolvedValue([
      { id: 'attempt_1', runId: 'run_1', pid: 999999 }, // PID that doesn't exist
    ]);

    await monitor.checkOnce();

    expect(mockRunService.markAttemptStale).toHaveBeenCalledWith(
      'attempt_1',
      'run_1',
      'stale_process_detected',
    );
  });

  it('does not mark alive process as stale', async () => {
    mockRunService.getRunningAttempts.mockResolvedValue([
      { id: 'attempt_1', runId: 'run_1', pid: process.pid }, // Current process is alive
    ]);

    await monitor.checkOnce();

    expect(mockRunService.markAttemptStale).not.toHaveBeenCalled();
  });

  it('starts periodic checking', async () => {
    mockRunService.getRunningAttempts.mockResolvedValue([]);
    monitor.start();

    // Wait for at least one check cycle
    await new Promise((r) => setTimeout(r, 250));
    monitor.stop();

    expect(mockRunService.getRunningAttempts).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/beasts/execution/health-monitor.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement HealthMonitor**

Create `packages/franken-orchestrator/src/beasts/execution/health-monitor.ts`:

```typescript
export interface HealthMonitorDeps {
  runService: {
    getRunningAttempts(): Promise<Array<{ id: string; runId: string; pid: number }>>;
    markAttemptStale(attemptId: string, runId: string, reason: string): Promise<void>;
  };
  intervalMs: number;
}

export class HealthMonitor {
  private readonly deps: HealthMonitorDeps;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: HealthMonitorDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkOnce().catch(() => {});
    }, this.deps.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkOnce(): Promise<void> {
    const attempts = await this.deps.runService.getRunningAttempts();

    for (const attempt of attempts) {
      if (!this.isPidAlive(attempt.pid)) {
        await this.deps.runService.markAttemptStale(
          attempt.id,
          attempt.runId,
          'stale_process_detected',
        );
      }
    }
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/beasts/execution/health-monitor.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/health-monitor.ts packages/franken-orchestrator/tests/unit/beasts/execution/health-monitor.test.ts
git commit -m "feat(orchestrator): add HealthMonitor with PID liveness checking"
```

---

### Task 2: Add heartbeat file support

- [ ] **Step 1: Write the failing test — heartbeat file staleness check**

Add to `packages/franken-orchestrator/tests/unit/beasts/execution/health-monitor.test.ts`:

```typescript
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('heartbeat file checking', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'heartbeat-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('detects stale heartbeat file (older than threshold)', async () => {
    const heartbeatPath = join(tempDir, 'heartbeat');
    // Write a heartbeat with an old timestamp
    await writeFile(heartbeatPath, String(Date.now() - 300_000)); // 5 minutes ago

    mockRunService.getRunningAttempts.mockResolvedValue([
      { id: 'attempt_1', runId: 'run_1', pid: process.pid, heartbeatFile: heartbeatPath },
    ]);

    const staleMonitor = new HealthMonitor({
      runService: mockRunService as any,
      intervalMs: 100,
      heartbeatStaleThresholdMs: 180_000, // 3 minutes
    });

    await staleMonitor.checkOnce();

    expect(mockRunService.markAttemptStale).toHaveBeenCalledWith(
      'attempt_1',
      'run_1',
      'heartbeat_stale',
    );
  });

  it('does not flag fresh heartbeat', async () => {
    const heartbeatPath = join(tempDir, 'heartbeat');
    await writeFile(heartbeatPath, String(Date.now())); // Just now

    mockRunService.getRunningAttempts.mockResolvedValue([
      { id: 'attempt_1', runId: 'run_1', pid: process.pid, heartbeatFile: heartbeatPath },
    ]);

    const staleMonitor = new HealthMonitor({
      runService: mockRunService as any,
      intervalMs: 100,
      heartbeatStaleThresholdMs: 180_000,
    });

    await staleMonitor.checkOnce();

    expect(mockRunService.markAttemptStale).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Add heartbeat checking to HealthMonitor**

Update `HealthMonitor` to accept `heartbeatStaleThresholdMs` in options and check heartbeat files:

```typescript
import { readFile } from 'node:fs/promises';

export interface HealthMonitorDeps {
  runService: {
    getRunningAttempts(): Promise<Array<{ id: string; runId: string; pid: number; heartbeatFile?: string }>>;
    markAttemptStale(attemptId: string, runId: string, reason: string): Promise<void>;
  };
  intervalMs: number;
  heartbeatStaleThresholdMs?: number; // Default: 180_000 (3 minutes)
}

// In checkOnce(), after PID check:
private async isHeartbeatStale(heartbeatFile: string | undefined): Promise<boolean> {
  if (!heartbeatFile) return false; // No heartbeat file configured — can't check
  try {
    const content = await readFile(heartbeatFile, 'utf-8');
    const timestamp = parseInt(content.trim(), 10);
    if (!Number.isFinite(timestamp)) return false;
    const threshold = this.deps.heartbeatStaleThresholdMs ?? 180_000;
    return Date.now() - timestamp > threshold;
  } catch {
    return false; // File doesn't exist yet — process may still be starting
  }
}
```

Update `checkOnce()` to check both PID and heartbeat:

```typescript
async checkOnce(): Promise<void> {
  const attempts = await this.deps.runService.getRunningAttempts();
  for (const attempt of attempts) {
    if (!this.isPidAlive(attempt.pid)) {
      await this.deps.runService.markAttemptStale(attempt.id, attempt.runId, 'stale_process_detected');
    } else if (await this.isHeartbeatStale(attempt.heartbeatFile)) {
      await this.deps.runService.markAttemptStale(attempt.id, attempt.runId, 'heartbeat_stale');
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/beasts/execution/health-monitor.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/health-monitor.ts packages/franken-orchestrator/tests/unit/beasts/execution/health-monitor.test.ts
git commit -m "feat(orchestrator): add heartbeat file staleness checking to HealthMonitor"
```

---

### Task 3: Wire heartbeat env vars into ProcessBeastExecutor

- [ ] **Step 1: Update ProcessBeastExecutor to set heartbeat env vars**

In `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`, in the `start()` method where env vars are set on the `BeastProcessSpec`:

```typescript
// Add heartbeat env vars to the spec
const heartbeatFile = join(projectRoot, '.frankenbeast', '.build', `heartbeat-${run.id}`);
spec.env = {
  ...spec.env,
  FRANKENBEAST_RUN_ID: run.id,
  FRANKENBEAST_HEARTBEAT_FILE: heartbeatFile,
};
```

- [ ] **Step 2: Add heartbeat file touch to Session**

In `packages/franken-orchestrator/src/cli/session.ts`, add a periodic heartbeat touch during execution:

```typescript
// At the start of runExecute() or start():
const heartbeatFile = process.env.FRANKENBEAST_HEARTBEAT_FILE;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
if (heartbeatFile) {
  const { writeFile } = await import('node:fs/promises');
  const touch = () => writeFile(heartbeatFile, String(Date.now())).catch(() => {});
  await touch(); // Initial touch
  heartbeatTimer = setInterval(touch, 60_000); // Every 60s
}

// At cleanup:
if (heartbeatTimer) clearInterval(heartbeatTimer);
```

- [ ] **Step 3: Run existing tests to ensure nothing breaks**

Run: `npx turbo run test --filter=franken-orchestrator`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts packages/franken-orchestrator/src/cli/session.ts
git commit -m "feat(orchestrator): wire heartbeat env vars and periodic file touch"
```

---

### Task 4: Daemon startup scan for stale processes

- [ ] **Step 1: Write the failing test — startup scan marks stale runs**

Add to `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`:

```typescript
describe('daemon startup scan', () => {
  it('scanAndCleanStaleRuns marks dead-PID runs as failed', async () => {
    const mockRunService = {
      getRunningAttempts: vi.fn().mockResolvedValue([
        { id: 'attempt_1', runId: 'run_1', pid: 999999 }, // Dead PID
      ]),
      markAttemptStale: vi.fn().mockResolvedValue(undefined),
    };

    const { HealthMonitor } = await import('../../../src/beasts/execution/health-monitor.js');
    const monitor = new HealthMonitor({
      runService: mockRunService as any,
      intervalMs: 30_000,
    });

    await monitor.checkOnce(); // One-shot scan

    expect(mockRunService.markAttemptStale).toHaveBeenCalledWith(
      'attempt_1',
      'run_1',
      'stale_process_detected',
    );
  });
});
```

- [ ] **Step 2: Wire startup scan into beast-daemon.ts**

In `startBeastDaemon()`, after server starts and PID file is written, call `monitor.checkOnce()` once for the startup scan:

```typescript
// After server starts:
const monitor = new HealthMonitor({
  runService: services.runs,
  intervalMs: 30_000, // 30s periodic check
});
await monitor.checkOnce(); // Startup scan — clean stale runs from previous daemon crash
monitor.start(); // Begin periodic monitoring
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/daemon/ --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/beast-daemon.ts packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts
git commit -m "feat(orchestrator): wire HealthMonitor startup scan into daemon bootstrap"
```
