# Chunk 03: Daemon Client — HTTP Bridge for CLI and Chat-Server

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `DaemonClient`, an HTTP client that CLI and chat-server use to talk to the beast daemon instead of calling beast services directly.

**Spec section:** Plan 2, Section 2 (daemon-client.ts) + Section 3 (CLI uses DaemonClient)

---

## Pre-conditions

- Chunk 01 complete (beast daemon has health endpoint running on configurable port)

---

## Files

- **Create:** `packages/franken-orchestrator/src/daemon/daemon-client.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/daemon/beast-daemon.ts` — daemon app from Chunk 01
- `packages/franken-web/src/lib/beast-api.ts` — existing frontend API client (similar pattern, 297 lines). `DaemonClient` is the backend equivalent.
- `packages/franken-orchestrator/src/cli/beast-cli.ts` — current CLI (96 lines), calls `services.dispatch.createRun()` directly. Will be updated in Chunk 05 to use `DaemonClient`.
- `packages/franken-orchestrator/src/beasts/services/agent-service.ts` — `AgentService` methods that map to daemon endpoints

---

## Current State

The CLI (`beast-cli.ts`) calls beast services directly via in-process references: `services.dispatch.createRun()`, `services.runs.stopRun()`, etc. The chat-server creates beast services in-process via `createBeastServices()`. Neither goes through HTTP. When beast services move to the daemon, both need an HTTP client.

---

## Tasks

### Task 1: DaemonClient — core request helper and health check

- [ ] **Step 1: Write the failing test — health check**

Create `packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonClient } from '../../../src/daemon/daemon-client.js';

describe('DaemonClient', () => {
  let client: DaemonClient;

  beforeEach(() => {
    client = new DaemonClient({
      baseUrl: 'http://localhost:4050',
      operatorToken: 'test-token',
    });
  });

  describe('health', () => {
    it('returns true when daemon responds 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });
      client = new DaemonClient({
        baseUrl: 'http://localhost:4050',
        operatorToken: 'test-token',
        fetch: mockFetch,
      });
      const healthy = await client.isHealthy();
      expect(healthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4050/v1/beasts/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns false when daemon is unreachable', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      client = new DaemonClient({
        baseUrl: 'http://localhost:4050',
        operatorToken: 'test-token',
        fetch: mockFetch,
      });
      const healthy = await client.isHealthy();
      expect(healthy).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/daemon-client.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DaemonClient skeleton**

Create `packages/franken-orchestrator/src/daemon/daemon-client.ts`:

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  operatorToken: string;
  fetch?: typeof globalThis.fetch;
}

export class DaemonClient {
  private readonly baseUrl: string;
  private readonly operatorToken: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: DaemonClientOptions) {
    this.baseUrl = options.baseUrl;
    this.operatorToken = options.operatorToken;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/v1/beasts/health');
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.operatorToken}`,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, body);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Daemon ${method} ${path} failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    return (json as { data: T }).data ?? json;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/daemon-client.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/daemon-client.ts packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts
git commit -m "feat(orchestrator): add DaemonClient with health check and request helper"
```

---

### Task 2: Agent CRUD methods on DaemonClient

- [ ] **Step 1: Write the failing tests — CRUD operations**

Add to `packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts`:

```typescript
describe('agent operations', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'agent_1' } }),
      text: () => Promise.resolve(''),
    });
    client = new DaemonClient({
      baseUrl: 'http://localhost:4050',
      operatorToken: 'test-token',
      fetch: mockFetch,
    });
  });

  it('listAgents calls GET /v1/beasts/agents', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'agent_1' }] }),
    });
    const agents = await client.listAgents();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(agents).toEqual([{ id: 'agent_1' }]);
  });

  it('getAgent calls GET /v1/beasts/agents/:id', async () => {
    await client.getAgent('agent_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents/agent_1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('createAgent calls POST /v1/beasts/agents', async () => {
    await client.createAgent({ definitionId: 'martin-loop', initAction: { kind: 'martin-loop', command: '', config: {} } });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('stopAgent calls POST /v1/beasts/agents/:id/stop', async () => {
    await client.stopAgent('agent_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents/agent_1/stop',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('killAgent calls POST /v1/beasts/agents/:id/kill', async () => {
    await client.killAgent('agent_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents/agent_1/kill',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('restartAgent calls POST /v1/beasts/agents/:id/restart', async () => {
    await client.restartAgent('agent_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents/agent_1/restart',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('resumeAgent calls POST /v1/beasts/agents/:id/resume', async () => {
    await client.resumeAgent('agent_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents/agent_1/resume',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('deleteAgent calls DELETE /v1/beasts/agents/:id (handles 204)', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    await client.deleteAgent('agent_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/agents/agent_1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('getCatalog calls GET /v1/beasts/catalog', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'martin-loop' }] }),
    });
    const catalog = await client.getCatalog();
    expect(catalog).toEqual([{ id: 'martin-loop' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/daemon/daemon-client.test.ts --reporter=verbose`
Expected: FAIL — methods not found

- [ ] **Step 3: Implement agent CRUD methods**

Add to `DaemonClient` class in `packages/franken-orchestrator/src/daemon/daemon-client.ts`:

```typescript
async listAgents(params?: { status?: string }): Promise<unknown[]> {
  const query = params?.status ? `?status=${params.status}` : '';
  return this.requestJson('GET', `/v1/beasts/agents${query}`);
}

async getAgent(agentId: string): Promise<unknown> {
  return this.requestJson('GET', `/v1/beasts/agents/${agentId}`);
}

async createAgent(input: { definitionId: string; initAction: unknown; [key: string]: unknown }): Promise<unknown> {
  return this.requestJson('POST', '/v1/beasts/agents', input);
}

async startAgent(agentId: string): Promise<unknown> {
  return this.requestJson('POST', `/v1/beasts/agents/${agentId}/start`);
}

async stopAgent(agentId: string): Promise<unknown> {
  return this.requestJson('POST', `/v1/beasts/agents/${agentId}/stop`);
}

async killAgent(agentId: string): Promise<unknown> {
  return this.requestJson('POST', `/v1/beasts/agents/${agentId}/kill`);
}

async restartAgent(agentId: string): Promise<unknown> {
  return this.requestJson('POST', `/v1/beasts/agents/${agentId}/restart`);
}

async resumeAgent(agentId: string): Promise<unknown> {
  return this.requestJson('POST', `/v1/beasts/agents/${agentId}/resume`);
}

async deleteAgent(agentId: string): Promise<void> {
  // DELETE returns 204 No Content — use request() not requestJson() to avoid JSON parse error
  const res = await this.request('DELETE', `/v1/beasts/agents/${agentId}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Daemon DELETE /v1/beasts/agents/${agentId} failed (${res.status}): ${text}`);
  }
}

async getCatalog(): Promise<unknown[]> {
  return this.requestJson('GET', '/v1/beasts/catalog');
}
```

Note: `request()` is private but `deleteAgent()` and `getCatalog()` need direct access. Change `request()` from `private` to `protected` (or make it package-accessible via the public methods above).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/daemon/daemon-client.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/daemon-client.ts packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts
git commit -m "feat(orchestrator): add agent CRUD methods to DaemonClient"
```

---

### Task 3: Run and log methods on DaemonClient

- [ ] **Step 1: Write the failing tests**

Add to `packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts`:

```typescript
describe('run operations', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run_1' } }),
    });
    client = new DaemonClient({
      baseUrl: 'http://localhost:4050',
      operatorToken: 'test-token',
      fetch: mockFetch,
    });
  });

  it('getRun calls GET /v1/beasts/runs/:id', async () => {
    await client.getRun('run_1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/runs/run_1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getLogs calls GET /v1/beasts/runs/:id/logs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: ['line1', 'line2'] }),
    });
    const logs = await client.getLogs('run_1');
    expect(logs).toEqual(['line1', 'line2']);
  });

  it('getStats calls GET /v1/beasts/stats', async () => {
    await client.getStats();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4050/v1/beasts/stats',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
```

- [ ] **Step 2: Implement run and log methods**

Add to `DaemonClient` class:

```typescript
async getRun(runId: string): Promise<unknown> {
  return this.requestJson('GET', `/v1/beasts/runs/${runId}`);
}

async getLogs(runId: string): Promise<string[]> {
  return this.requestJson('GET', `/v1/beasts/runs/${runId}/logs`);
}

async getStats(): Promise<unknown> {
  return this.requestJson('GET', '/v1/beasts/stats');
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/daemon/daemon-client.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/daemon/daemon-client.ts packages/franken-orchestrator/tests/unit/daemon/daemon-client.test.ts
git commit -m "feat(orchestrator): add run/log/stats methods to DaemonClient"
```
