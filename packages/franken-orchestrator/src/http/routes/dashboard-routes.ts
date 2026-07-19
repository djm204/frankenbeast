import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { SecurityConfig } from '../../middleware/security-profiles.js';
import { extractOperatorToken, extractOperatorTokenCookie, isCookieOperatorAuthAllowed } from '../operator-auth.js';
import {
  type DashboardAvailabilitySnapshot,
  buildDashboardAvailabilitySnapshot,
  type DashboardDependencySnapshot,
  type DashboardProviderSnapshot,
} from './dashboard-status.js';
import type { MaintenanceModeState } from '../../beasts/services/maintenance-mode-service.js';
import type { SloDashboard } from '../../availability/slo-dashboard.js';
import { isLoopbackHost } from '../../network/network-config.js';

const DASHBOARD_SNAPSHOT_POLL_MS = 1_000;
const DASHBOARD_HEARTBEAT_MS = 30_000;
const DASHBOARD_SSE_TICKET_SCOPE = 'dashboard';
const TRUSTED_REMOTE_ADDRESS_HEADER = 'x-frankenbeast-remote-address';

export interface DashboardRouteDeps {
  skillManager: SkillManager;
  getSecurityConfig: () => SecurityConfig;
  getProviders: () => DashboardProviderSnapshot[];
  getDependencies?: (() => DashboardDependencySnapshot[] | Promise<DashboardDependencySnapshot[]>) | undefined;
  getAvailability?: (() => DashboardAvailabilitySnapshot | Promise<DashboardAvailabilitySnapshot>) | undefined;
  getMaintenanceMode?: (() => MaintenanceModeState | Promise<MaintenanceModeState>) | undefined;
  getSloDashboard?: (() => SloDashboard | Promise<SloDashboard>) | undefined;
  operatorToken?: string | undefined;
  ticketStore?: SseConnectionTicketStore | undefined;
}

async function readOptionalSloDashboard(deps: DashboardRouteDeps): Promise<SloDashboard | undefined> {
  try {
    return await deps.getSloDashboard?.();
  } catch {
    return undefined;
  }
}

async function buildAvailability(deps: DashboardRouteDeps) {
  if (deps.getAvailability) {
    return deps.getAvailability();
  }
  const providers = deps.getProviders();
  const dependencies = deps.getDependencies ? await deps.getDependencies() : [];
  return buildDashboardAvailabilitySnapshot(providers, dependencies);
}

async function buildSnapshot(deps: DashboardRouteDeps) {
  const skills = deps.skillManager.listInstalled();
  const enabledSkills = new Set(deps.skillManager.getEnabledSkills());
  const security = deps.getSecurityConfig();
  const providers = deps.getProviders();
  const availability = await buildAvailability(deps);

  return {
    skills: skills.map((s) => ({
      ...s,
      enabled: enabledSkills.has(s.name),
    })),
    security,
    providers,
    availability,
    maintenance: await deps.getMaintenanceMode?.(),
    slo: await readOptionalSloDashboard(deps),
  };
}

function snapshotDiffKey(snapshot: Awaited<ReturnType<typeof buildSnapshot>>): string {
  const { slo, ...rest } = snapshot;
  if (!slo) return JSON.stringify(snapshot);
  return JSON.stringify({
    ...rest,
    slo: {
      ...slo,
      generatedAt: '<volatile>',
    },
  });
}

function safeTokenCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4MappedAddress = normalized.match(/^::ffff:(127(?:\.\d{1,3}){3})$/)?.[1];
  return isLoopbackHost(ipv4MappedAddress ?? normalized);
}

function isForwardedForLoopback(forwardedFor: string | undefined): boolean {
  if (forwardedFor === undefined) return true;
  return forwardedFor
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
    .every(isLoopbackAddress);
}

function isForwardedHostLoopback(forwardedHost: string | undefined): boolean {
  if (forwardedHost === undefined) return true;
  return forwardedHost
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
    .every((host) => {
      try {
        return isLoopbackAddress(new URL(`http://${host}`).hostname);
      } catch {
        return false;
      }
    });
}

function isLoopbackDashboardRequest(c: Context): boolean {
  const hostname = new URL(c.req.url).hostname;
  const trustedRemoteAddress = c.req.header(TRUSTED_REMOTE_ADDRESS_HEADER);
  const realIp = c.req.header('x-real-ip');
  const forwardedHostIsLoopback = isForwardedHostLoopback(c.req.header('x-forwarded-host'));
  const forwardedForIsLoopback = isForwardedForLoopback(c.req.header('x-forwarded-for'));
  const realIpIsLoopback = realIp === undefined || isLoopbackAddress(realIp);

  if (trustedRemoteAddress !== undefined) {
    return isLoopbackAddress(trustedRemoteAddress)
      && isLoopbackAddress(hostname)
      && forwardedHostIsLoopback
      && forwardedForIsLoopback
      && realIpIsLoopback;
  }

  // Direct Hono callers do not have a Node socket address. Production Node
  // requests always receive the trusted peer header in http-server-utils.
  return isLoopbackAddress(hostname)
    && forwardedHostIsLoopback
    && forwardedForIsLoopback
    && realIpIsLoopback;
}

function authenticateTicketRequest(c: Context, operatorToken: string): Response | undefined {
  const headerToken = extractOperatorToken(c.req.header('Authorization'))
    ?? c.req.header('x-frankenbeast-operator-token')
    ?? undefined;
  const cookieToken = extractOperatorTokenCookie(c.req.header('cookie'));
  const provided = headerToken ?? cookieToken;

  if (!headerToken && cookieToken && !isCookieOperatorAuthAllowed({
    method: c.req.method,
    origin: c.req.header('origin'),
    requestUrl: c.req.url,
    secFetchSite: c.req.header('sec-fetch-site'),
    forwardedProto: c.req.header('x-forwarded-proto'),
    forwardedHost: c.req.header('x-forwarded-host'),
  })) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cookie operator authentication requires a same-origin request' } }, 403);
  }

  if (!provided || !safeTokenCompare(provided, operatorToken)) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' } }, 401);
  }

  return undefined;
}

export function createDashboardRoutes(deps: DashboardRouteDeps): Hono {
  const app = new Hono();
  const ticketStore = deps.ticketStore;
  const operatorToken = deps.operatorToken;

  // Event ids are scoped to this route instance instead of each connection and
  // include an epoch so a restarted dashboard route never reuses old ids.
  const dashboardSnapshotEpoch = randomUUID();
  let dashboardSnapshotSequence = 0;

  // GET /api/dashboard — aggregated snapshot of all dashboard state
  app.get('/', async (c) => {
    return c.json(await buildSnapshot(deps));
  });

  // GET /api/dashboard/health — machine-readable service health aggregator for monitors
  app.get('/health', async (c) => {
    return c.json(await buildAvailability(deps));
  });

  // POST /api/dashboard/events/ticket — authenticated callers mint a one-shot
  // short-lived ticket before EventSource opens the SSE stream. EventSource
  // cannot attach bearer headers, and raw streams are rejected below.
  app.post('/events/ticket', (c) => {
    if (!operatorToken) {
      return c.json({ ticket: null });
    }
    const authError = authenticateTicketRequest(c, operatorToken);
    if (authError) return authError;
    if (!ticketStore) {
      return c.json({ error: { code: 'UNAVAILABLE', message: 'Dashboard SSE tickets are not configured' } }, 503);
    }

    return c.json({ ticket: ticketStore.issue(operatorToken, DASHBOARD_SSE_TICKET_SCOPE) });
  });

  // GET /api/dashboard/events — ticket-authenticated SSE stream for real-time dashboard updates
  app.get('/events', (c) => {
    const ticket = c.req.query('ticket');
    if (!operatorToken && !isLoopbackDashboardRequest(c)) {
      return c.json({
        error: {
          code: 'FORBIDDEN',
          message: 'Dashboard events require operator authentication or a loopback-only request',
        },
      }, 403);
    }
    if (operatorToken) {
      if (!ticketStore || !ticket) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
      }
      const ticketStatus = ticketStore.consume(ticket, operatorToken, DASHBOARD_SSE_TICKET_SCOPE);
      if (ticketStatus === 'reused') {
        return c.body(null, 204);
      }
      if (ticketStatus === 'invalid') {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
      }
    }

    return streamSSE(c, async (stream) => {
      const initialSnapshot = await buildSnapshot(deps);
      let lastSnapshot = JSON.stringify(initialSnapshot);
      let lastSnapshotDiffKey = snapshotDiffKey(initialSnapshot);

      // Send initial snapshot
      dashboardSnapshotSequence += 1;
      await stream.writeSSE({
        id: `dashboard:${dashboardSnapshotEpoch}:${dashboardSnapshotSequence}`,
        event: 'snapshot',
        data: lastSnapshot,
      });

      const cleanup: Array<() => void> = [];
      const clearAll = () => {
        while (cleanup.length > 0) {
          cleanup.pop()?.();
        }
      };

      const snapshotInterval = setInterval(async () => {
        let nextSnapshot: string;
        let nextSnapshotDiffKey: string;
        try {
          const snapshot = await buildSnapshot(deps);
          nextSnapshot = JSON.stringify(snapshot);
          nextSnapshotDiffKey = snapshotDiffKey(snapshot);
        } catch {
          return;
        }

        if (nextSnapshotDiffKey === lastSnapshotDiffKey) {
          return;
        }
        lastSnapshot = nextSnapshot;
        lastSnapshotDiffKey = nextSnapshotDiffKey;
        dashboardSnapshotSequence += 1;
        try {
          await stream.writeSSE({ id: `dashboard:${dashboardSnapshotEpoch}:${dashboardSnapshotSequence}`, event: 'snapshot', data: nextSnapshot });
        } catch {
          clearAll();
        }
      }, DASHBOARD_SNAPSHOT_POLL_MS);
      cleanup.push(() => clearInterval(snapshotInterval));

      const heartbeatInterval = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'heartbeat', data: '' });
        } catch {
          clearAll();
        }
      }, DASHBOARD_HEARTBEAT_MS);
      cleanup.push(() => clearInterval(heartbeatInterval));

      // Block until client disconnects (single onAbort — Hono stores one callback, not a list)
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearAll();
          resolve();
        });
      });
    });
  });

  return app;
}
