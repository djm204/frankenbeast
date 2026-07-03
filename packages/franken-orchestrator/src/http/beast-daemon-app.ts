import { Hono } from 'hono';
import type { BeastServiceBundle } from '../beasts/create-beast-services.js';
import { agentRoutes } from './routes/agent-routes.js';
import { beastRoutes } from './routes/beast-routes.js';
import { createBeastSseRoutes } from './routes/beast-sse-routes.js';
import { errorHandler } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';

export interface BeastDaemonAppOptions {
  services: BeastServiceBundle;
  operatorToken: string;
  startedAt?: string;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export function createBeastDaemonApp(options: BeastDaemonAppOptions): Hono {
  const app = new Hono();
  const security = new TransportSecurityService();
  const rateLimit = options.rateLimit ?? { windowMs: 60_000, max: 20 };
  const startedAt = options.startedAt ?? new Date().toISOString();
  const services = options.services;

  app.onError(errorHandler);

  app.get('/health', (c) => {
    c.header('x-frankenbeast-service', 'beasts-daemon');
    return c.json({
      ok: true,
      service: 'beasts-daemon',
      startedAt,
      agents: services.agents.listAgents().length,
      runs: services.runs.listRuns().length,
    });
  });

  const routeDeps = {
    ...services,
    security,
    operatorToken: options.operatorToken,
    rateLimit,
  };

  app.route('/', createBeastSseRoutes({
    bus: services.eventBus,
    ticketStore: services.ticketStore,
    operatorToken: options.operatorToken,
    getSnapshot: () => ({
      agents: services.agents.listAgents().map((agent) => ({
        id: agent.id,
        definitionId: agent.definitionId,
        status: agent.status,
        updatedAt: agent.updatedAt,
      })),
    }),
  }));
  app.route('/', beastRoutes(routeDeps));
  app.route('/', agentRoutes({
    agents: services.agents,
    dispatch: services.dispatch,
    runs: services.runs,
    operatorToken: options.operatorToken,
    security,
    rateLimit,
  }));

  return app;
}
