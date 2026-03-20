# Chunk 03: SSE Event Stream Hook — useBeastEventStream

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a React hook `useBeastEventStream` that connects to the beast daemon's SSE endpoint, replaces polling, and provides real-time agent state updates.

**Spec section:** Plan 3, Section 3

---

## Pre-conditions

- **Plan 2 Chunk 01** complete (daemon running with SSE endpoints: `GET /v1/beasts/events/stream`, `POST /v1/beasts/events/ticket`)
- **Plan 1 Chunk 06** complete (BeastEventBus, connection ticket store, SSE stream route with sequence IDs + replay)

**This chunk CANNOT be implemented until Plan 2's daemon is live with SSE endpoints.** Chunks 01, 02, and 05 of this plan can proceed independently.

---

## Files

- **Create:** `packages/franken-web/src/hooks/use-beast-event-stream.ts`
- **Test:** `packages/franken-web/src/hooks/__tests__/use-beast-event-stream.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-web/src/components/chat-shell.tsx` — lines 178-242: the polling `useEffect` that this hook replaces
- Plan 1 Chunk 06 spec — `docs/superpowers/specs/plan1-foundation-execution-pipeline/06_sse-event-bus-connection-tickets.md` for SSE event format, ticket flow, event types
- `packages/franken-web/src/lib/beast-api.ts` — types: `TrackedAgentSummary`, `TrackedAgentDetail`

---

## Current State

`ChatShell` polls every 4 seconds via a `useEffect` (lines 178-242):
1. Fetches `getCatalog()` + `listAgents()` in parallel
2. If agent selected: fetches `getAgent()`, then `getRun()` + `getLogs()` in parallel
3. Re-runs when `selectedBeastAgentId` changes (closes/reopens interval)
4. Uses `beastRefreshNonce` to force refetches after mutations

This is replaced by an SSE connection that receives push updates.

---

## Tasks

### Task 1: Create useBeastEventStream hook

- [ ] **Step 1: Write the failing tests**

Create `packages/franken-web/src/hooks/__tests__/use-beast-event-stream.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBeastEventStream } from '../use-beast-event-stream.js';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((event: { data: string; lastEventId?: string }) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    // Simulate connection
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  addEventListener(type: string, fn: (event: { data: string }) => void) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(fn);
  }

  removeEventListener(type: string, fn: (event: { data: string }) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }

  close() {
    this.readyState = 2;
  }

  // Test helper — simulate server event
  emit(type: string, data: unknown, id?: string) {
    for (const fn of this.listeners[type] ?? []) {
      fn({ data: JSON.stringify(data), lastEventId: id });
    }
  }
}

describe('useBeastEventStream', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);

    // Mock ticket fetch
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { ticket: 'test-ticket-123' } }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a ticket and opens EventSource with ticket param', async () => {
    const { result } = renderHook(() =>
      useBeastEventStream('http://localhost:4050', 'test-token'),
    );

    // Wait for ticket fetch + EventSource creation
    await vi.waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/events/ticket',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );

    expect(MockEventSource.instances[0].url).toBe(
      'http://localhost:4050/v1/beasts/events/stream?ticket=test-ticket-123',
    );
  });

  it('updates agents on snapshot event', async () => {
    const { result } = renderHook(() =>
      useBeastEventStream('http://localhost:4050', 'test-token'),
    );

    await vi.waitFor(() => expect(MockEventSource.instances.length).toBe(1));

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('snapshot', [
        { id: 'agent_1', status: 'running', definitionId: 'martin-loop' },
      ]);
    });

    expect(result.current.agents).toEqual([
      { id: 'agent_1', status: 'running', definitionId: 'martin-loop' },
    ]);
  });

  it('updates specific agent on agent.status event', async () => {
    const { result } = renderHook(() =>
      useBeastEventStream('http://localhost:4050', 'test-token'),
    );

    await vi.waitFor(() => expect(MockEventSource.instances.length).toBe(1));

    const es = MockEventSource.instances[0];

    // Set initial state
    act(() => {
      es.emit('snapshot', [
        { id: 'agent_1', status: 'running', definitionId: 'martin-loop' },
      ]);
    });

    // Update status
    act(() => {
      es.emit('agent.status', { agentId: 'agent_1', status: 'completed' });
    });

    expect(result.current.agents[0].status).toBe('completed');
  });

  it('selectAgent does not reconnect EventSource', async () => {
    const { result } = renderHook(() =>
      useBeastEventStream('http://localhost:4050', 'test-token'),
    );

    await vi.waitFor(() => expect(MockEventSource.instances.length).toBe(1));

    act(() => {
      result.current.selectAgent('agent_1');
    });

    // Still only one EventSource instance — no reconnection
    expect(MockEventSource.instances.length).toBe(1);
  });

  it('closes EventSource on unmount', async () => {
    const { unmount } = renderHook(() =>
      useBeastEventStream('http://localhost:4050', 'test-token'),
    );

    await vi.waitFor(() => expect(MockEventSource.instances.length).toBe(1));

    const es = MockEventSource.instances[0];
    unmount();
    expect(es.readyState).toBe(2); // CLOSED
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/franken-web/`: `npx vitest run src/hooks/__tests__/use-beast-event-stream.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useBeastEventStream**

Create `packages/franken-web/src/hooks/use-beast-event-stream.ts`:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

interface TrackedAgentSummary {
  id: string;
  status: string;
  definitionId: string;
  [key: string]: unknown;
}

interface UseBeastEventStreamResult {
  agents: TrackedAgentSummary[];
  selectedAgentDetail: unknown | null;
  logs: Map<string, string[]>;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'error';
  selectAgent: (agentId: string) => void;
}

export function useBeastEventStream(
  daemonUrl: string,
  operatorToken: string,
): UseBeastEventStreamResult {
  const [agents, setAgents] = useState<TrackedAgentSummary[]>([]);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<unknown | null>(null);
  const [logs, setLogs] = useState<Map<string, string[]>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<UseBeastEventStreamResult['connectionStatus']>('connecting');

  const selectedAgentIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // selectAgent only sets the ref — no closure over agents state, so it's stable
  const selectAgent = useCallback((agentId: string) => {
    selectedAgentIdRef.current = agentId;
  }, []);

  // Update selectedAgentDetail reactively when agents or selected ID changes
  useEffect(() => {
    if (!selectedAgentIdRef.current) return;
    const found = agents.find((a) => a.id === selectedAgentIdRef.current);
    setSelectedAgentDetail(found ?? null);
  }, [agents]);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    async function connect() {
      try {
        if (!cancelled) setConnectionStatus(retryCount > 0 ? 'reconnecting' : 'connecting');

        // Step 1: Get ticket (re-requested on every connect/reconnect)
        const ticketRes = await fetch(`${daemonUrl}/v1/beasts/events/ticket`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${operatorToken}` },
        });

        if (!ticketRes.ok || cancelled) return;
        const { data } = await ticketRes.json();
        if (cancelled) return;

        // Step 2: Open EventSource
        const es = new EventSource(
          `${daemonUrl}/v1/beasts/events/stream?ticket=${data.ticket}`,
        );
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!cancelled) {
            setConnectionStatus('connected');
            retryCount = 0; // Reset on successful connection
          }
        };

        // NOTE: Native EventSource error events do not expose HTTP status codes.
        // On any error (including ticket expiry/401), close the EventSource and
        // reconnect with a fresh ticket. Exponential backoff prevents tight loops.
        es.onerror = () => {
          if (cancelled) return;
          es.close();
          eventSourceRef.current = null;
          setConnectionStatus('reconnecting');

          if (retryCount < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
            retryCount++;
            setTimeout(() => { if (!cancelled) connect(); }, delay);
          } else {
            setConnectionStatus('error');
          }
        };

        es.addEventListener('snapshot', (event) => {
          if (cancelled) return;
          const agentList = JSON.parse((event as MessageEvent).data);
          setAgents(agentList);
        });

        es.addEventListener('agent.status', (event) => {
          if (cancelled) return;
          const update = JSON.parse((event as MessageEvent).data);
          setAgents((prev) =>
            prev.map((a) =>
              a.id === update.agentId ? { ...a, status: update.status } : a,
            ),
          );
        });

        es.addEventListener('agent.event', (event) => {
          if (cancelled) return;
          const data = JSON.parse((event as MessageEvent).data);
          if (selectedAgentIdRef.current === data.agentId) {
            setSelectedAgentDetail((prev: any) => ({
              ...prev,
              events: [...(prev?.events ?? []), data.event],
            }));
          }
        });

        es.addEventListener('run.log', (event) => {
          if (cancelled) return;
          const data = JSON.parse((event as MessageEvent).data);
          setLogs((prev) => {
            const next = new Map(prev);
            const lines = next.get(data.runId) ?? [];
            next.set(data.runId, [...lines, data.line]);
            return next;
          });
        });
      } catch {
        if (!cancelled) setConnectionStatus('error');
      }
    }

    connect();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
    };
  }, [daemonUrl, operatorToken]);

  return { agents, selectedAgentDetail, logs, connectionStatus, selectAgent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/use-beast-event-stream.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/hooks/use-beast-event-stream.ts packages/franken-web/src/hooks/__tests__/use-beast-event-stream.test.ts
git commit -m "feat(web): add useBeastEventStream hook for real-time agent updates"
```
