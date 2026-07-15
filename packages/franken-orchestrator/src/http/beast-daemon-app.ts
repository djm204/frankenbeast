import { Hono } from 'hono';
import type { BeastServiceBundle } from '../beasts/create-beast-services.js';
import { agentRoutes } from './routes/agent-routes.js';
import { beastRoutes } from './routes/beast-routes.js';
import { createBeastSseRoutes } from './routes/beast-sse-routes.js';
import { HttpError, errorHandler } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';
import { isoNow } from '@franken/types';

export interface BeastDaemonDrainState {
  isDraining(): boolean;
  beginMutation?(): () => void;
  enteredAt?: string | undefined;
  reason?: string | undefined;
}

export interface BeastDaemonAppOptions {
  services: BeastServiceBundle;
  operatorToken: string;
  startedAt?: string;
  root?: string;
  pid?: number;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  drainState?: BeastDaemonDrainState | undefined;
}

export function createBeastDaemonApp(options: BeastDaemonAppOptions): Hono {
  const app = new Hono();
  const security = new TransportSecurityService();
  const rateLimit = options.rateLimit ?? { windowMs: 60_000, max: 20 };
  const startedAt = options.startedAt ?? isoNow();
  const services = options.services;

  app.onError(errorHandler);

  app.get('/health', (c) => {
    c.header('x-frankenbeast-service', 'beasts-daemon');
    const draining = options.drainState?.isDraining() ?? false;
    return c.json({
      ok: !draining,
      status: draining ? 'draining' : 'ok',
      service: 'beasts-daemon',
      startedAt,
      root: options.root,
      pid: options.pid,
      agents: services.agents.listAgents().length,
      runs: services.runs.listRuns().length,
      draining,
      ...(draining ? {
        drain: {
          enteredAt: options.drainState?.enteredAt,
          reason: options.drainState?.reason ?? 'shutdown',
        },
      } : {}),
    }, draining ? 503 : 200);
  });

  const drainMutatingRequest = async (next: () => Promise<void>): Promise<void> => {
    if (options.drainState?.isDraining()) {
      throw new HttpError(503, 'BEAST_DAEMON_DRAINING', 'Beast daemon is draining for shutdown and is not accepting new work', {
        status: 'draining',
        enteredAt: options.drainState.enteredAt,
        reason: options.drainState.reason ?? 'shutdown',
      });
    }
    const finishMutation = options.drainState?.beginMutation?.();
    try {
      await next();
    } finally {
      finishMutation?.();
    }
  };

  const routeDeps = {
    ...services,
    security,
    operatorToken: options.operatorToken,
    rateLimit,
    drainMutatingRequest,
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
    drainMutatingRequest,
  }));

  return app;
}
