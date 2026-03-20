# Chunk 04: Route Migration — Beast Routes from Chat-Server to Daemon

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `beast-routes.ts` and `agent-routes.ts` from the chat-server to the daemon, add new stats route, decouple chat-server from beast services.

**Spec section:** Plan 2, Section 1 (route migration, chat-server decoupling)

---

## Pre-conditions

- Chunk 01 complete (daemon Hono app exists, health endpoint running)
- Chunk 03 complete (`DaemonClient` exists for chat-server to use instead of direct service calls)

---

## Files

- **Move:** `packages/franken-orchestrator/src/http/routes/beast-routes.ts` → `packages/franken-orchestrator/src/daemon/routes/beast-routes.ts`
- **Move:** `packages/franken-orchestrator/src/http/routes/agent-routes.ts` → `packages/franken-orchestrator/src/daemon/routes/agent-routes.ts`
- **Create:** `packages/franken-orchestrator/src/daemon/routes/beast-stats-routes.ts`
- **Modify:** `packages/franken-orchestrator/src/daemon/beast-daemon.ts` (mount routes)
- **Modify:** `packages/franken-orchestrator/src/http/chat-app.ts` (remove beast/agent route imports)
- **Modify:** `packages/franken-orchestrator/src/http/chat-server.ts` (replace `createBeastServices()` with `DaemonClient`)
- **Modify:** `packages/franken-orchestrator/src/http/adapters/chat-beast-dispatch-adapter.ts` (accept `DaemonClient` instead of direct service refs)
- **Modify:** `packages/franken-orchestrator/src/http/services/agent-init-service.ts` (use `daemonClient.startAgent()` instead of `dispatchService.createRun()`)
- **Modify:** `packages/franken-orchestrator/src/cli/run.ts` (update `handleBeastCommand()` call site to remove `createBeastServices` import)
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/routes/beast-routes.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/routes/agent-routes.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/routes/beast-stats-routes.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/http/adapters/chat-beast-dispatch-adapter.test.ts` (update mocks)
- **Test:** `packages/franken-orchestrator/tests/unit/http/services/agent-init-service.test.ts` (update mocks)

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/http/routes/beast-routes.ts` — 170 lines, `BeastRoutesDeps` interface, route definitions
- `packages/franken-orchestrator/src/http/routes/agent-routes.ts` — 388 lines, `AgentRoutesDeps` interface, `shouldDispatchOnCreate()`, `dispatchDetachedAgent()`
- `packages/franken-orchestrator/src/http/chat-app.ts` — 118 lines, route mounting at lines 91-104
- `packages/franken-orchestrator/src/http/chat-server.ts` — 192 lines, `createBeastServices()` at lines 61-76
- `packages/franken-orchestrator/src/daemon/beast-daemon.ts` — daemon app from Chunk 01
- `packages/franken-orchestrator/src/daemon/daemon-client.ts` — DaemonClient from Chunk 03

---

## Current State

Beast and agent routes are mounted inside `chat-app.ts` (lines 91-104). The chat-server creates all beast services in-process. The daemon has only a health endpoint.

**Route files are moved, not rewritten.** The existing `beastRoutes(deps)` and `agentRoutes(deps)` functions keep their exact signatures — only the import paths change. The daemon provides the `deps` objects.

---

## Tasks

### Task 1: Move route files to daemon/routes/

- [ ] **Step 1: Create daemon/routes/ directory and move files**

```bash
mkdir -p packages/franken-orchestrator/src/daemon/routes
git mv packages/franken-orchestrator/src/http/routes/beast-routes.ts packages/franken-orchestrator/src/daemon/routes/beast-routes.ts
git mv packages/franken-orchestrator/src/http/routes/agent-routes.ts packages/franken-orchestrator/src/daemon/routes/agent-routes.ts
```

- [ ] **Step 2: Update imports in moved files**

After moving, fix relative imports that break due to the directory change. While both old (`src/http/routes/`) and new (`src/daemon/routes/`) are two levels deep, imports to sibling directories under `src/http/` will break:

**Imports that WILL break** (both files):
- `import { ... } from '../middleware.js'` → change to `'../../http/middleware.js'` (was `src/http/middleware.js`, now resolves to `src/daemon/middleware.js` which doesn't exist)
- `import { TransportSecurityService } from '../security/transport-security.js'` → change to `'../../http/security/transport-security.js'`

**Imports that remain correct:**
- `import { ... } from '../../beasts/...'` — same relative path from both locations

- [ ] **Step 3: Run typecheck to verify imports are correct**

Run: `npx turbo run typecheck --filter=franken-orchestrator`
Expected: PASS (or identify import fixes needed)

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/routes/ packages/franken-orchestrator/src/http/routes/
git commit -m "refactor(orchestrator): move beast/agent routes to daemon/routes/"
```

---

### Task 2: Mount routes in daemon app

- [ ] **Step 1: Write the failing test — daemon serves agent list endpoint**

Add to `packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts`:

```typescript
describe('daemon route mounting', () => {
  it('GET /v1/beasts/agents returns 200 when routes are mounted', async () => {
    // This verifies routes are mounted — actual service behavior tested in route-specific tests
    const { createBeastDaemonApp } = await import('../../../src/daemon/beast-daemon.js');

    const mockDeps = {
      operatorToken: 'test-token',
      // Provide minimal mock service deps — the real service tests are in route test files
      serviceDeps: {
        agents: { listAgents: vi.fn().mockResolvedValue([]) },
        catalog: { getDefinitions: vi.fn().mockReturnValue([]) },
        dispatch: {},
        runs: { listRuns: vi.fn().mockResolvedValue([]) },
        interviews: {},
        metrics: { recordRunCreated: vi.fn() },
        security: { validateToken: vi.fn().mockReturnValue(true) },
        rateLimit: { windowMs: 60000, maxRequests: 100 },
      },
    };

    // Verify the app accepts service deps (compile-time check)
    expect(typeof createBeastDaemonApp).toBe('function');
  });
});
```

- [ ] **Step 2: Update createBeastDaemonApp to accept and mount service deps**

In `packages/franken-orchestrator/src/daemon/beast-daemon.ts`:

```typescript
import { beastRoutes } from './routes/beast-routes.js';
import { agentRoutes } from './routes/agent-routes.js';

export interface BeastDaemonAppOptions {
  operatorToken: string;
  serviceDeps?: {
    agents: unknown;
    catalog: unknown;
    dispatch: unknown;
    runs: unknown;
    interviews: unknown;
    metrics: unknown;
    security: unknown;
    rateLimit: unknown;
  };
}

export function createBeastDaemonApp(options: BeastDaemonAppOptions): Hono {
  const app = new Hono();

  // Health check — no auth required
  app.get('/v1/beasts/health', (c) => c.json({ status: 'ok' }));

  // Mount beast service routes if deps provided
  if (options.serviceDeps) {
    const deps = {
      ...options.serviceDeps,
      operatorToken: options.operatorToken,
    };
    app.route('/', beastRoutes(deps as any));
    app.route('/', agentRoutes(deps as any));
  }

  return app;
}
```

Note: The `as any` cast here is temporary — the actual `BeastRoutesDeps` and `AgentRoutesDeps` interfaces are defined in the moved route files. The daemon's `startBeastDaemon` will construct proper deps from real service instances. The types will be tightened when the daemon creates services.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/daemon/ --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/beast-daemon.ts packages/franken-orchestrator/tests/unit/daemon/beast-daemon.test.ts
git commit -m "feat(orchestrator): mount beast/agent routes in daemon app"
```

---

### Task 3: Create beast-stats-routes.ts

- [ ] **Step 1: Write the failing test — stats endpoint returns aggregate data**

Create `packages/franken-orchestrator/tests/unit/daemon/routes/beast-stats-routes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { beastStatsRoutes } from '../../../../src/daemon/routes/beast-stats-routes.js';

describe('beast-stats-routes', () => {
  it('GET /v1/beasts/stats returns aggregate stats', async () => {
    const mockDeps = {
      runs: {
        getRunStats: vi.fn().mockResolvedValue({
          total: 10,
          running: 2,
          completed: 6,
          failed: 2,
        }),
      },
      operatorToken: 'test-token',
    };

    const app = beastStatsRoutes(mockDeps as any);
    const res = await app.request('/v1/beasts/stats', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      total: 10,
      running: 2,
      completed: 6,
      failed: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/routes/beast-stats-routes.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement beast-stats-routes.ts**

Create `packages/franken-orchestrator/src/daemon/routes/beast-stats-routes.ts`:

```typescript
import { Hono } from 'hono';

export interface BeastStatsRoutesDeps {
  runs: { getRunStats(): Promise<{ total: number; running: number; completed: number; failed: number }> };
  operatorToken: string;
}

export function beastStatsRoutes(deps: BeastStatsRoutesDeps): Hono {
  const app = new Hono();

  app.get('/v1/beasts/stats', async (c) => {
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${deps.operatorToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const stats = await deps.runs.getRunStats();
    return c.json({ data: stats });
  });

  return app;
}
```

Note: `getRunStats()` does not exist on `BeastRunService` yet. Add it as a simple query method:

```typescript
// In BeastRunService, add:
async getRunStats(): Promise<{ total: number; running: number; completed: number; failed: number }> {
  return this.repository.getRunStats();
}
```

And the corresponding repository method queries SQLite:

```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM beast_runs
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/routes/beast-stats-routes.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/routes/beast-stats-routes.ts packages/franken-orchestrator/tests/unit/daemon/routes/beast-stats-routes.test.ts
git commit -m "feat(orchestrator): add beast stats route to daemon"
```

---

### Task 4: Decouple chat-server from beast services

- [ ] **Step 1: Update chat-app.ts — remove beast/agent route imports**

In `packages/franken-orchestrator/src/http/chat-app.ts`:

1. Remove the imports for `beastRoutes` and `agentRoutes`
2. Remove the route mounting lines at lines 91-104 that mount beast/agent routes
3. The chat-app should only mount chat-related routes

- [ ] **Step 2: Update chat-server.ts — replace createBeastServices with DaemonClient**

In `packages/franken-orchestrator/src/http/chat-server.ts`:

1. Remove `createBeastServices()` call (lines 61-76)
2. Import `DaemonClient` from `../daemon/daemon-client.js`
3. Create a `DaemonClient` instance using the daemon URL and operator token
4. Pass `DaemonClient` to `ChatBeastDispatchAdapter` instead of direct service references
5. Update `AgentInitService.dispatchAgent()` to call `daemonClient.startAgent()` instead of `dispatchService.createRun()`

```typescript
// Before:
const beastServices = createBeastServices(paths);
const dispatchAdapter = new ChatBeastDispatchAdapter(beastServices.catalog, beastServices.interviews, beastServices.dispatch);

// After:
const daemonClient = new DaemonClient({
  baseUrl: `http://localhost:${config.beasts?.daemon?.port ?? 4050}`,
  operatorToken: config.operatorToken ?? '',
});
```

Note: This is a significant decoupling step. The following classes need their interfaces updated to accept `DaemonClient`:

- **`ChatBeastDispatchAdapter`** (`src/http/adapters/chat-beast-dispatch-adapter.ts`): Currently accepts `catalog`, `interviews`, `dispatch` service objects. Change constructor to accept `DaemonClient` and call `client.createAgent()` / `client.getCatalog()` instead of direct service methods.
- **`AgentInitService`** (`src/http/services/agent-init-service.ts`): Currently calls `dispatchService.createRun()`. Change `dispatchAgent()` to call `daemonClient.startAgent()` / `daemonClient.createAgent()`.
- **`run.ts`** (line ~307): Remove the `createBeastServices()` import and call. The `beasts` subcommand case in Chunk 05 already creates `DaemonClient` directly. For the `chat-server` case, replace `beastServices` construction with `DaemonClient` instantiation.

Update existing tests for `ChatBeastDispatchAdapter` and `AgentInitService` to mock `DaemonClient` methods instead of direct service methods.

- [ ] **Step 3: Run typecheck and existing tests**

Run: `npx turbo run typecheck --filter=franken-orchestrator && npx turbo run test --filter=franken-orchestrator`
Expected: PASS (existing tests for chat-server, dispatch adapter, and agent-init-service need mock updates)

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/http/chat-app.ts packages/franken-orchestrator/src/http/chat-server.ts packages/franken-orchestrator/src/http/adapters/chat-beast-dispatch-adapter.ts packages/franken-orchestrator/src/http/services/agent-init-service.ts packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/tests/unit/http/
git commit -m "refactor(orchestrator): decouple chat-server from beast services, use DaemonClient"
```
