# Chunk 01: Beast Daemon Bootstrap

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone Hono HTTP server (`beast-daemon.ts`) that can be started via `frankenbeast beasts-daemon`, writes a PID file, and exposes a health endpoint.

**Spec section:** Plan 2, Section 1 (first half) + Section 2 (startup)

---

## Pre-conditions

- Plan 1 complete (ProcessSupervisor has exit handling, ProcessBeastExecutor has callbacks)

---

## Files

- **Create:** `packages/franken-orchestrator/src/daemon/beast-daemon.ts`
- **Create:** `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts`
- **Modify:** `packages/franken-orchestrator/src/cli/args.ts`
- **Modify:** `packages/franken-orchestrator/src/cli/run.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/cli/args.ts` — `VALID_SUBCOMMANDS` at line 78, `Subcommand` type, `parseArgs()`
- `packages/franken-orchestrator/src/cli/run.ts` — subcommand dispatch at lines 244-359, `handleBeastCommand()` at line 249
- `packages/franken-orchestrator/src/http/chat-server.ts` — `startChatServer()` pattern for Hono server bootstrap (lines 61-76 for beast services creation)
- `packages/franken-orchestrator/src/config/orchestrator-config.ts` — `OrchestratorConfigSchema` for config patterns

---

## Current State

There is no daemon. Beast services are created inside `chat-server.ts` via `createBeastServices()` (line 306-307 in `run.ts`). The `VALID_SUBCOMMANDS` array at line 78 of `args.ts` includes: `'init'`, `'interview'`, `'plan'`, `'run'`, `'beasts'`, `'issues'`, `'chat'`, `'chat-server'`, `'network'`. There is no `'beasts-daemon'` subcommand.

---

## Tasks

### Task 1: Add `beasts-daemon` subcommand to arg parser

- [ ] **Step 1: Write the failing test — `beasts-daemon` is a valid subcommand**

Create `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../../src/cli/args.js';

describe('beasts-daemon subcommand', () => {
  it('parses beasts-daemon as a valid subcommand', () => {
    const args = parseArgs(['beasts-daemon']);
    expect(args.subcommand).toBe('beasts-daemon');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/beast-daemon.test.ts --reporter=verbose`
Expected: FAIL — `beasts-daemon` not in `VALID_SUBCOMMANDS`

- [ ] **Step 3: Add `beasts-daemon` to args.ts**

In `packages/franken-orchestrator/src/cli/args.ts`:

1. Add `'beasts-daemon'` to the `Subcommand` type union
2. Add `'beasts-daemon'` to the `VALID_SUBCOMMANDS` Set at line 78

Note: `VALID_SUBCOMMANDS` is a `Set`, not an array:

```typescript
// In the Subcommand type (union type at lines 3-13):
type Subcommand = 'init' | 'interview' | 'plan' | 'run' | 'beasts' | 'issues' | 'chat' | 'chat-server' | 'network' | 'beasts-daemon';

// In VALID_SUBCOMMANDS (Set at line 78):
const VALID_SUBCOMMANDS = new Set(['init', 'interview', 'plan', 'run', 'beasts', 'issues', 'chat', 'chat-server', 'network', 'beasts-daemon']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/beast-daemon.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts
git commit -m "feat(orchestrator): add beasts-daemon subcommand to arg parser"
```

---

### Task 2: Create daemon-lifecycle.ts with PID file management

- [ ] **Step 1: Write the failing test — PID file write and read**

Create `packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonLifecycle } from '../../../src/daemon/daemon-lifecycle.js';

describe('DaemonLifecycle', () => {
  let tempDir: string;
  let lifecycle: DaemonLifecycle;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'daemon-test-'));
    lifecycle = new DaemonLifecycle({ pidFilePath: join(tempDir, 'beasts-daemon.pid') });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('writes PID file with current process PID', async () => {
    await lifecycle.writePidFile(12345);
    const pid = await lifecycle.readPidFile();
    expect(pid).toBe(12345);
  });

  it('returns null when PID file does not exist', async () => {
    const pid = await lifecycle.readPidFile();
    expect(pid).toBeNull();
  });

  it('removes PID file', async () => {
    await lifecycle.writePidFile(12345);
    await lifecycle.removePidFile();
    const pid = await lifecycle.readPidFile();
    expect(pid).toBeNull();
  });

  it('detects stale PID file when process does not exist', async () => {
    // Use a PID that almost certainly doesn't exist
    await lifecycle.writePidFile(999999);
    const isAlive = await lifecycle.isDaemonAlive();
    expect(isAlive).toBe(false);
  });

  it('detects alive daemon via kill -0', async () => {
    // Current process is always alive
    await lifecycle.writePidFile(process.pid);
    const isAlive = await lifecycle.isDaemonAlive();
    expect(isAlive).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/daemon-lifecycle.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DaemonLifecycle**

Create `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts`:

```typescript
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface DaemonLifecycleOptions {
  pidFilePath: string;
}

export class DaemonLifecycle {
  private readonly pidFilePath: string;

  constructor(options: DaemonLifecycleOptions) {
    this.pidFilePath = options.pidFilePath;
  }

  async writePidFile(pid: number): Promise<void> {
    await mkdir(dirname(this.pidFilePath), { recursive: true });
    await writeFile(this.pidFilePath, String(pid), 'utf-8');
  }

  async readPidFile(): Promise<number | null> {
    try {
      const content = await readFile(this.pidFilePath, 'utf-8');
      const pid = parseInt(content.trim(), 10);
      return Number.isFinite(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  async removePidFile(): Promise<void> {
    try {
      await unlink(this.pidFilePath);
    } catch {
      // Already gone — fine
    }
  }

  async isDaemonAlive(): Promise<boolean> {
    const pid = await this.readPidFile();
    if (pid === null) return false;
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

Run: `npx vitest run tests/unit/daemon/daemon-lifecycle.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts
git commit -m "feat(orchestrator): add DaemonLifecycle with PID file management"
```

---

### Task 3: Create beast-daemon.ts Hono server with health endpoint

- [ ] **Step 1: Write the failing test — health endpoint returns 200**

Add to `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`:

```typescript
import { createBeastDaemonApp } from '../../../src/daemon/beast-daemon.js';

describe('beast daemon app', () => {
  it('GET /v1/beasts/health returns 200 with status ok', async () => {
    const app = createBeastDaemonApp({ operatorToken: 'test-token' });
    const res = await app.request('/v1/beasts/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/beast-daemon.test.ts --reporter=verbose`
Expected: FAIL — `createBeastDaemonApp` not found

- [ ] **Step 3: Implement beast-daemon.ts**

Create `packages/franken-orchestrator/src/daemon/beast-daemon.ts`:

```typescript
import { Hono } from 'hono';

export interface BeastDaemonAppOptions {
  operatorToken: string;
}

export function createBeastDaemonApp(options: BeastDaemonAppOptions): Hono {
  const app = new Hono();

  // Health check — no auth required
  app.get('/v1/beasts/health', (c) => {
    return c.json({ status: 'ok' });
  });

  return app;
}
```

Note: Route mounting (beast-routes, agent-routes, SSE) happens in Chunk 04. Auth middleware using `options.operatorToken` is added when routes are mounted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/beast-daemon.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/beast-daemon.ts packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts
git commit -m "feat(orchestrator): create beast daemon Hono app with health endpoint"
```

---

### Task 4: Wire `beasts-daemon` subcommand in run.ts

- [ ] **Step 1: Write the failing test — subcommand starts daemon server**

Add to `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('beasts-daemon subcommand handler', () => {
  it('startBeastDaemon creates server and writes PID file', async () => {
    // This is a wiring test — verifies the function signature exists and
    // accepts the expected options shape
    const { startBeastDaemon } = await import('../../../src/daemon/beast-daemon.js');
    expect(typeof startBeastDaemon).toBe('function');
  });
});
```

- [ ] **Step 2: Add startBeastDaemon function**

**Dependency check:** Verify `@hono/node-server` is in `packages/franken-orchestrator/package.json` dependencies. If not, install it:
```bash
cd packages/franken-orchestrator && npm install @hono/node-server
```
The `hono` package is already a dependency (used by `chat-server.ts`), but `@hono/node-server` is the Node.js adapter needed for `serve()`.

Add to `packages/franken-orchestrator/src/daemon/beast-daemon.ts`:

```typescript
import { serve } from '@hono/node-server';
import { DaemonLifecycle } from './daemon-lifecycle.js';

export interface StartBeastDaemonOptions {
  port: number;
  pidFilePath: string;
  operatorToken: string;
}

export async function startBeastDaemon(options: StartBeastDaemonOptions): Promise<{ close: () => void }> {
  const app = createBeastDaemonApp({ operatorToken: options.operatorToken });
  const lifecycle = new DaemonLifecycle({ pidFilePath: options.pidFilePath });

  const server = serve({ fetch: app.fetch, port: options.port });

  await lifecycle.writePidFile(process.pid);

  const close = () => {
    server.close();
    lifecycle.removePidFile().catch(() => {});
  };

  process.on('SIGTERM', close);
  process.on('SIGINT', close);

  return { close };
}
```

- [ ] **Step 3: Wire into run.ts subcommand dispatch**

In `packages/franken-orchestrator/src/cli/run.ts`, add a case in the subcommand dispatch block (around line 249):

```typescript
case 'beasts-daemon': {
  const { startBeastDaemon } = await import('../daemon/beast-daemon.js');
  await startBeastDaemon({
    port: config.beasts?.daemon?.port ?? 4050,
    pidFilePath: join(paths.projectRoot, '.frankenbeast', 'beasts-daemon.pid'),
    operatorToken: config.operatorToken ?? '',
  });
  return;
}
```

- [ ] **Step 4: Run all tests to verify nothing is broken**

Run: `npx vitest run tests/unit/daemon/ --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/beast-daemon.ts packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts
git commit -m "feat(orchestrator): wire beasts-daemon subcommand to start daemon server"
```
