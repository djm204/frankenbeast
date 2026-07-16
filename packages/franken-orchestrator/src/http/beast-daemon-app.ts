import { Hono } from 'hono';
import type { BeastServiceBundle } from '../beasts/create-beast-services.js';
import { requireBeastOperatorAuth } from '../beasts/http/beast-auth.js';
import { agentRoutes } from './routes/agent-routes.js';
import { beastRoutes } from './routes/beast-routes.js';
import { createBeastSseRoutes } from './routes/beast-sse-routes.js';
import { HttpError, errorHandler, localBrowserControlProtection } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';
import { isoNow } from '@franken/types';
import {
  availabilityModeDenialDetails,
  InMemoryAvailabilityModeState,
  type AvailabilityModeSnapshot,
  type AvailabilityModeState,
} from './availability-mode.js';

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
  availabilityMode?: AvailabilityModeState | undefined;
}

const READ_ONLY_DEGRADED_POST_ALLOWLIST = new Set([
  '/v1/beasts/availability/degraded',
  '/v1/beasts/events/ticket',
]);

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isReadOnlyDegradedAllowlisted(method: string, pathname: string): boolean {
  if (method === 'DELETE' && pathname === '/v1/beasts/availability/degraded') {
    return true;
  }
  return method === 'POST' && READ_ONLY_DEGRADED_POST_ALLOWLIST.has(pathname);
}

function dependencyCountSnapshot(services: BeastServiceBundle, availabilityMode: AvailabilityModeState): {
  readonly agents: number | null;
  readonly runs: number | null;
  readonly availability: AvailabilityModeSnapshot;
} {
  try {
    return {
      agents: services.agents.listAgents().length,
      runs: services.runs.listRuns().length,
      availability: availabilityMode.snapshot(),
    };
  } catch (error) {
    const reason = error instanceof Error && error.message
      ? `Health dependency read failed: ${error.message}`
      : 'Health dependency read failed';
    return {
      agents: null,
      runs: null,
      availability: availabilityMode.enterReadOnlyDegraded(reason, 'automatic'),
    };
  }
}

export function createBeastDaemonApp(options: BeastDaemonAppOptions): Hono {
  const app = new Hono();
  const security = new TransportSecurityService();
  const rateLimit = options.rateLimit ?? { windowMs: 60_000, max: 20 };
  const startedAt = options.startedAt ?? isoNow();
  const services = options.services;
  const availabilityMode = options.availabilityMode ?? new InMemoryAvailabilityModeState();
  const auth = requireBeastOperatorAuth({
    operatorToken: options.operatorToken,
    security,
  });

  app.onError(errorHandler);
  app.use('*', localBrowserControlProtection());

  app.use('/v1/beasts/*', async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (!UNSAFE_METHODS.has(method)) {
      await next();
      return;
    }
    const pathname = new URL(c.req.url).pathname;
    if (isReadOnlyDegradedAllowlisted(method, pathname)) {
      await next();
      return;
    }

    let authenticated = false;
    await auth(c, async () => {
      authenticated = true;
    });
    if (!authenticated) {
      return;
    }

    const snapshot = availabilityMode.snapshot();
    if (snapshot.mode === 'read-only-degraded') {
      throw new HttpError(
        503,
        'READ_ONLY_DEGRADED_MODE',
        'Orchestrator is in read-only degraded mode; mutating operations are disabled',
        availabilityModeDenialDetails(snapshot),
      );
    }
    await next();
  });

  app.get('/health', (c) => {
    c.header('x-frankenbeast-service', 'beasts-daemon');
    const draining = options.drainState?.isDraining() ?? false;
    const dependencyCounts = dependencyCountSnapshot(services, availabilityMode);
    return c.json({
      ok: !draining && !dependencyCounts.availability.readOnly,
      status: draining ? 'draining' : dependencyCounts.availability.readOnly ? 'degraded' : 'ok',
      service: 'beasts-daemon',
      startedAt,
      root: options.root,
      pid: options.pid,
      agents: dependencyCounts.agents,
      runs: dependencyCounts.runs,
      draining,
      availability: dependencyCounts.availability,
      ...(draining ? {
        drain: {
          enteredAt: options.drainState?.enteredAt,
          reason: options.drainState?.reason ?? 'shutdown',
        },
      } : {}),
    }, draining || dependencyCounts.availability.readOnly ? 503 : 200);
  });

  app.post('/v1/beasts/availability/degraded', auth, async (c) => {
    let reason = 'operator-requested';
    try {
      const body = await c.req.json() as { reason?: unknown };
      if (typeof body.reason === 'string' && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Treat an empty/malformed body as a manual degraded-mode request with
      // the default reason; this route is an operator safety valve.
    }
    return c.json({ data: availabilityMode.enterReadOnlyDegraded(reason, 'operator') });
  });

  app.delete('/v1/beasts/availability/degraded', auth, (c) => {
    return c.json({ data: availabilityMode.leaveReadOnlyDegraded() });
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
  }));

  return app;
}
