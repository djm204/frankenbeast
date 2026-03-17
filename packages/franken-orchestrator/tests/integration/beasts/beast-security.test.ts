import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatApp } from '../../../src/http/chat-app.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastInterviewService } from '../../../src/beasts/services/beast-interview-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/beast-security');

function createSecuredApp(rateLimitMax = 1) {
  mkdirSync(TMP, { recursive: true });
  const repository = new SQLiteBeastRepository(join(TMP, 'beasts.db'));
  const logStore = new BeastLogStore(join(TMP, 'logs'));
  const catalog = new BeastCatalogService();
  const metrics = new PrometheusBeastMetrics();
  const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
  const executors = {
    process: {
      start: vi.fn(async () => { throw new Error('not needed'); }),
      stop: vi.fn(),
      kill: vi.fn(),
    },
    container: {
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
    },
  };

  return createChatApp({
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'beast-security',
    beastControl: {
      agents,
      catalog,
      dispatch: new BeastDispatchService(repository, catalog, executors, metrics, logStore),
      runs: new BeastRunService(repository, catalog, executors, metrics, logStore),
      interviews: new BeastInterviewService(repository, catalog),
      metrics,
      security: new TransportSecurityService(),
      operatorToken: 'super-secret-operator-token',
      eventBus: new BeastEventBus(),
      ticketStore: new SseConnectionTicketStore(),
      rateLimit: {
        windowMs: 60_000,
        max: rateLimitMax,
      },
    },
  });
}

describe('beast route security', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rejects unauthorized requests', async () => {
    const app = createSecuredApp();

    const response = await app.request('/v1/beasts/catalog');

    expect(response.status).toBe(401);
  });

  it('rate limits repeated dispatch attempts', async () => {
    const app = createSecuredApp(1);
    const headers = {
      authorization: 'Bearer super-secret-operator-token',
      'content-type': 'application/json',
    };

    const first = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'first',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });
    const second = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'second',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
  });
});
