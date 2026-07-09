import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { SecurityConfig } from '../../middleware/security-profiles.js';
import { extractOperatorToken, extractOperatorTokenCookie, isCookieOperatorAuthAllowed } from '../operator-auth.js';

const DASHBOARD_SNAPSHOT_POLL_MS = 1_000;
const DASHBOARD_HEARTBEAT_MS = 30_000;
const DASHBOARD_SSE_TICKET_SCOPE = 'dashboard';

export interface DashboardRouteDeps {
  skillManager: SkillManager;
  getSecurityConfig: () => SecurityConfig;
  getProviders: () => Array<{ name: string; type: string; available: boolean; failoverOrder: number }>;
  operatorToken?: string | undefined;
  ticketStore?: SseConnectionTicketStore | undefined;
}

function buildSnapshot(deps: DashboardRouteDeps) {
  const skills = deps.skillManager.listInstalled();
  const enabledSkills = new Set(deps.skillManager.getEnabledSkills());
  const security = deps.getSecurityConfig();
  const providers = deps.getProviders();

  return {
    skills: skills.map((s) => ({
      ...s,
      enabled: enabledSkills.has(s.name),
    })),
    security,
    providers,
  };
}

function safeTokenCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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

  // GET /api/dashboard — aggregated snapshot of all dashboard state
  app.get('/', (c) => {
    return c.json(buildSnapshot(deps));
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
      let lastSnapshot = JSON.stringify(buildSnapshot(deps));

      // Send initial snapshot
      await stream.writeSSE({
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
        try {
          nextSnapshot = JSON.stringify(buildSnapshot(deps));
        } catch {
          return;
        }

        if (nextSnapshot === lastSnapshot) {
          return;
        }
        lastSnapshot = nextSnapshot;
        try {
          await stream.writeSSE({ event: 'snapshot', data: nextSnapshot });
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
