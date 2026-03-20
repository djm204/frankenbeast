# Chunk 06: SSE Endpoint + Event Bus + Connection Tickets

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a push-based SSE endpoint so the dashboard receives real-time agent/run status updates instead of polling. Implement the connection ticket auth pattern (ADR-030), an in-process event bus, sequence IDs for replay, and the Hono SSE route.

**Spec section:** Plan 1, Section 6

**ADR:** `docs/adr/030-sse-connection-tickets-auth.md`

**Depends on:** Chunk 02 (executor publishes to event bus), Chunk 05 (error events surfaced)

---

## Files

- **Create:** `packages/franken-orchestrator/src/beasts/events/beast-event-bus.ts`
- **Create:** `packages/franken-orchestrator/src/beasts/events/sse-connection-ticket.ts`
- **Create:** `packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (emit to event bus)
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (emit to event bus)
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/events/beast-event-bus.test.ts`
- **Create:** `packages/franken-orchestrator/tests/unit/beasts/events/sse-connection-ticket.test.ts`
- **Create:** `packages/franken-orchestrator/tests/integration/beasts/sse-stream.test.ts`

---

## Pre-conditions (from earlier chunks)

After Chunk 02: `ProcessBeastExecutor` constructor is `(repository, logs, supervisor, onRunStatusChange?)`. This chunk changes it to use an options object.
After Chunk 05: `BeastRunService.syncTrackedAgent` appends agent-level events for terminal states.

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/http/sse.ts` — existing SSE implementation for chat (uses `streamSSE` from hono). Pattern reference for Hono SSE streaming.
- `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` — where `syncTrackedAgent` lives (publishes agent status changes)
- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — where log lines and exit events originate
- `docs/adr/030-sse-connection-tickets-auth.md` — auth design (single-use UUID ticket, 30s TTL, in-memory map)

---

## Tasks

### Task 1: Create BeastEventBus

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/events/beast-event-bus.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BeastEventBus, type BeastSseEvent } from '../../../../src/beasts/events/beast-event-bus.js';

describe('BeastEventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];
    bus.subscribe((event) => received.push(event));

    bus.publish({
      type: 'agent.status',
      data: { agentId: 'agent_1', status: 'running', updatedAt: '2026-03-16T00:00:00Z' },
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('agent.status');
  });

  it('assigns monotonic sequence IDs', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];
    bus.subscribe((event) => received.push(event));

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });
    bus.publish({ type: 'agent.status', data: { agentId: 'a2', status: 'failed', updatedAt: '' } });

    expect(received[0].id).toBe(1);
    expect(received[1].id).toBe(2);
  });

  it('supports unsubscribe', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];
    const unsub = bus.subscribe((event) => received.push(event));

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });
    unsub();
    bus.publish({ type: 'agent.status', data: { agentId: 'a2', status: 'running', updatedAt: '' } });

    expect(received).toHaveLength(1);
  });

  it('replays events from a given sequence ID', () => {
    const bus = new BeastEventBus();

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });
    bus.publish({ type: 'agent.status', data: { agentId: 'a2', status: 'failed', updatedAt: '' } });
    bus.publish({ type: 'run.log', data: { runId: 'r1', line: 'hello' } });

    const missed = bus.replaySince(1); // events after ID 1
    expect(missed).toHaveLength(2);
    expect(missed[0].id).toBe(2);
    expect(missed[1].id).toBe(3);
  });

  it('returns empty array if no events to replay', () => {
    const bus = new BeastEventBus();

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });

    const missed = bus.replaySince(1);
    expect(missed).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/events/beast-event-bus.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement BeastEventBus**

Create `packages/franken-orchestrator/src/beasts/events/beast-event-bus.ts`:

```typescript
export interface BeastSseEvent {
  id?: number;
  type: string;
  data: Record<string, unknown>;
}

type EventListener = (event: BeastSseEvent) => void | Promise<void>;

/**
 * In-process event bus for SSE streaming.
 * Services publish events; SSE routes subscribe and serialize to HTTP streams.
 * Maintains a replay buffer for reconnection support.
 */
export class BeastEventBus {
  private sequence = 0;
  private readonly listeners = new Set<EventListener>();
  private readonly buffer: BeastSseEvent[] = [];
  private readonly maxBufferSize: number;

  constructor(maxBufferSize = 1000) {
    this.maxBufferSize = maxBufferSize;
  }

  publish(event: Omit<BeastSseEvent, 'id'>): void {
    this.sequence += 1;
    const stamped: BeastSseEvent = { ...event, id: this.sequence };

    this.buffer.push(stamped);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    for (const listener of this.listeners) {
      try {
        const result = listener(stamped);
        // Handle async listeners — catch rejections so one broken listener doesn't break others
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch {
        // Don't let a failing sync listener break others
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns events with id > lastEventId for reconnection replay.
   * If the gap is too large (> maxBufferSize), returns empty (caller should send snapshot).
   */
  replaySince(lastEventId: number): BeastSseEvent[] {
    return this.buffer.filter((e) => e.id !== undefined && e.id > lastEventId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/events/beast-event-bus.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/events/beast-event-bus.ts packages/franken-orchestrator/tests/unit/beasts/events/beast-event-bus.test.ts
git commit -m "feat(beasts): add BeastEventBus with sequence IDs and replay buffer"
```

---

### Task 2: Create SSE Connection Ticket Store

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/unit/beasts/events/sse-connection-ticket.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseConnectionTicketStore } from '../../../../src/beasts/events/sse-connection-ticket.js';

describe('SseConnectionTicketStore', () => {
  let store: SseConnectionTicketStore;

  beforeEach(() => {
    store = new SseConnectionTicketStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it('issues a ticket and validates it', () => {
    const ticket = store.issue('operator-token-123');
    expect(typeof ticket).toBe('string');
    expect(ticket.length).toBeGreaterThan(0);

    const result = store.validate(ticket);
    expect(result).toBe(true);
  });

  it('burns ticket on first use (single-use)', () => {
    const ticket = store.issue('operator-token-123');

    expect(store.validate(ticket)).toBe(true);
    expect(store.validate(ticket)).toBe(false); // burned
  });

  it('rejects expired tickets', async () => {
    const store = new SseConnectionTicketStore({ ttlMs: 50 });
    const ticket = store.issue('operator-token-123');

    await new Promise((r) => setTimeout(r, 100));

    expect(store.validate(ticket)).toBe(false);
    store.destroy();
  });

  it('rejects unknown tickets', () => {
    expect(store.validate('nonexistent-uuid')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/events/sse-connection-ticket.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement SseConnectionTicketStore**

Create `packages/franken-orchestrator/src/beasts/events/sse-connection-ticket.ts`:

```typescript
import { randomUUID } from 'node:crypto';

interface TicketEntry {
  token: string;
  expiresAt: number;
}

export interface SseConnectionTicketStoreOptions {
  /** Ticket TTL in milliseconds. Default: 30_000 (30s). */
  ttlMs?: number;
  /** Cleanup interval in milliseconds. Default: 60_000 (60s). */
  cleanupIntervalMs?: number;
}

/**
 * In-memory single-use ticket store for SSE connection auth.
 * See ADR-030 for design rationale.
 */
export class SseConnectionTicketStore {
  private readonly tickets = new Map<string, TicketEntry>();
  private readonly ttlMs: number;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(options?: SseConnectionTicketStoreOptions) {
    this.ttlMs = options?.ttlMs ?? 30_000;
    const cleanupMs = options?.cleanupIntervalMs ?? 60_000;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
  }

  /** Issue a single-use ticket tied to the operator token. */
  issue(token: string): string {
    const ticket = randomUUID();
    this.tickets.set(ticket, {
      token,
      expiresAt: Date.now() + this.ttlMs,
    });
    return ticket;
  }

  /** Validate and burn a ticket. Returns true if valid, false otherwise. */
  validate(ticket: string): boolean {
    const entry = this.tickets.get(ticket);
    if (!entry) return false;

    // Burn immediately (single-use)
    this.tickets.delete(ticket);

    // Check expiry
    if (Date.now() > entry.expiresAt) return false;

    return true;
  }

  /** Remove expired tickets. */
  private cleanup(): void {
    const now = Date.now();
    for (const [ticket, entry] of this.tickets) {
      if (now > entry.expiresAt) {
        this.tickets.delete(ticket);
      }
    }
  }

  /** Stop the cleanup interval. Call on shutdown. */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/events/sse-connection-ticket.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/events/sse-connection-ticket.ts packages/franken-orchestrator/tests/unit/beasts/events/sse-connection-ticket.test.ts
git commit -m "feat(beasts): add SseConnectionTicketStore with single-use tickets and TTL"
```

---

### Task 3: Create SSE Hono Routes

- [ ] **Step 1: Write the failing test**

Create `packages/franken-orchestrator/tests/integration/beasts/sse-stream.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createBeastSseRoutes } from '../../../src/http/routes/beast-sse-routes.js';

describe('Beast SSE routes', () => {
  let ticketStore: SseConnectionTicketStore;

  afterEach(() => {
    ticketStore?.destroy();
  });

  it('POST /v1/beasts/events/ticket returns a ticket', async () => {
    const bus = new BeastEventBus();
    ticketStore = new SseConnectionTicketStore();
    const app = new Hono();
    app.route('/', createBeastSseRoutes({ bus, ticketStore, operatorToken: 'secret-token' }));

    const res = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toBeDefined();
    expect(typeof body.ticket).toBe('string');
  });

  it('POST /v1/beasts/events/ticket rejects invalid bearer token', async () => {
    const bus = new BeastEventBus();
    ticketStore = new SseConnectionTicketStore();
    const app = new Hono();
    app.route('/', createBeastSseRoutes({ bus, ticketStore, operatorToken: 'secret-token' }));

    const res = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });

    expect(res.status).toBe(401);
  });

  it('GET /v1/beasts/events/stream rejects invalid ticket', async () => {
    const bus = new BeastEventBus();
    ticketStore = new SseConnectionTicketStore();
    const app = new Hono();
    app.route('/', createBeastSseRoutes({ bus, ticketStore, operatorToken: 'secret-token' }));

    const res = await app.request('/v1/beasts/events/stream?ticket=bogus');

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/franken-orchestrator && npx vitest run tests/integration/beasts/sse-stream.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement beast-sse-routes.ts**

Create `packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts`:

```typescript
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { BeastEventBus } from '../../beasts/events/beast-event-bus.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';

export interface BeastSseRouteDeps {
  bus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  operatorToken: string;
}

export function createBeastSseRoutes(deps: BeastSseRouteDeps): Hono {
  const app = new Hono();
  const { bus, ticketStore, operatorToken } = deps;

  // POST /v1/beasts/events/ticket — issue a connection ticket
  app.post('/v1/beasts/events/ticket', (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${operatorToken}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' } }, 401);
    }

    const ticket = ticketStore.issue(operatorToken);
    return c.json({ ticket });
  });

  // GET /v1/beasts/events/stream — SSE stream
  app.get('/v1/beasts/events/stream', (c) => {
    const ticket = c.req.query('ticket');
    if (!ticket || !ticketStore.validate(ticket)) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }

    const lastEventId = c.req.header('Last-Event-ID');

    return streamSSE(c, async (stream) => {
      // Send replay if reconnecting
      if (lastEventId) {
        const id = parseInt(lastEventId, 10);
        if (!isNaN(id)) {
          const missed = bus.replaySince(id);
          for (const event of missed) {
            await stream.writeSSE({
              id: String(event.id),
              event: event.type,
              data: JSON.stringify(event.data),
            });
          }
        }
      }

      // Subscribe to live events
      const unsub = bus.subscribe(async (event) => {
        try {
          await stream.writeSSE({
            id: String(event.id),
            event: event.type,
            data: JSON.stringify(event.data),
          });
        } catch {
          // Stream closed
          unsub();
        }
      });

      // Clean up on disconnect
      c.req.raw.signal.addEventListener('abort', () => {
        unsub();
      });

      // Keep stream alive
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => resolve());
      });
    });
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/franken-orchestrator && npx vitest run tests/integration/beasts/sse-stream.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts packages/franken-orchestrator/tests/integration/beasts/sse-stream.test.ts
git commit -m "feat(beasts): add SSE routes with connection ticket auth"
```

---

### Task 4: Wire services to emit events to the bus

- [ ] **Step 1: Add BeastEventBus as a dependency to BeastRunService**

Update `beast-run-service.ts` constructor to accept optional event bus. Since the constructor already has 5 positional params, add an optional options object:

```typescript
export interface BeastRunServiceOptions {
  eventBus?: BeastEventBus;
}

constructor(
  private readonly repository: SQLiteBeastRepository,
  private readonly catalog: BeastCatalogService,
  private readonly executors: BeastExecutors,
  private readonly metrics: BeastMetrics,
  private readonly logs: BeastLogStore,
  private readonly serviceOptions: BeastRunServiceOptions = {},
) {}
```

Import:
```typescript
import type { BeastEventBus } from '../events/beast-event-bus.js';
```

- [ ] **Step 2: Emit agent.status events from syncTrackedAgent**

In `syncTrackedAgent`, after updating the tracked agent, publish to event bus:

```typescript
this.serviceOptions.eventBus?.publish({
  type: 'agent.status',
  data: { agentId: run.trackedAgentId, status, updatedAt: new Date().toISOString() },
});
```

- [ ] **Step 3: Emit run.status events from handleProcessExit callbacks**

In `ProcessBeastExecutor`, add event bus via an options pattern to avoid fragile positional optionals:

```typescript
export interface ProcessBeastExecutorOptions {
  onRunStatusChange?: (runId: string) => void;
  eventBus?: BeastEventBus;
}

// Update constructor from Chunk 02's (repo, logs, supervisor, onRunStatusChange?) to:
constructor(
  private readonly repository: SQLiteBeastRepository,
  private readonly logs: BeastLogStore,
  private readonly supervisor: ProcessSupervisorLike,
  private readonly options: ProcessBeastExecutorOptions = {},
) {}
```

Update all internal references: `this.onRunStatusChange?.(...)` → `this.options.onRunStatusChange?.(...)` and add `this.options.eventBus?.publish(...)`.

**Note:** This changes the constructor from Chunk 02. All existing call sites (including tests from Chunks 02-05) must pass `{ onRunStatusChange }` as the 4th arg instead of the bare function. Update them as part of this task.

In `handleProcessExit`, publish run.status:

```typescript
this.options.eventBus?.publish({
  type: 'run.status',
  data: { runId, status, updatedAt: finishedAt },
});
```

In the `onStdout` and `onStderr` callbacks inside `start()`, publish `run.log`:

```typescript
this.options.eventBus?.publish({
  type: 'run.log',
  data: { runId: run.id, attemptId, stream: 'stdout', line },
});
```

- [ ] **Step 4: Run full test suite to verify no regressions**

```bash
cd packages/franken-orchestrator && npx vitest run
```

Expected: All pass. Existing tests don't provide an event bus, so `eventBus?.publish()` is a no-op.

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/services/beast-run-service.ts packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts
git commit -m "feat(beasts): wire BeastEventBus into RunService and ProcessBeastExecutor"
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

- [ ] **Step 3: Run build**

```bash
npx turbo run build --filter=franken-orchestrator
```

Expected: All clean.

---

## Success Criteria

1. `BeastEventBus` publishes events with monotonic sequence IDs, supports subscribe/unsubscribe, and replay
2. `SseConnectionTicketStore` issues single-use UUID tickets with 30s TTL
3. `POST /v1/beasts/events/ticket` validates bearer token, returns ticket
4. `GET /v1/beasts/events/stream?ticket=X` validates ticket, streams SSE events
5. `Last-Event-ID` header triggers replay of missed events
6. `BeastRunService` and `ProcessBeastExecutor` publish to event bus when status changes or logs arrive
7. All existing tests pass

## Verification

```bash
cd packages/franken-orchestrator && npx vitest run tests/unit/beasts/events/
cd packages/franken-orchestrator && npx vitest run tests/integration/beasts/sse-stream.test.ts
cd packages/franken-orchestrator && npx vitest run
cd packages/franken-orchestrator && npx tsc --noEmit
```
