import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { SecurityConfig } from '../../middleware/security-profiles.js';

const DASHBOARD_SNAPSHOT_POLL_MS = 1_000;
const DASHBOARD_HEARTBEAT_MS = 30_000;

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
    if (!ticketStore) {
      return c.json({ error: { code: 'UNAVAILABLE', message: 'Dashboard SSE tickets are not configured' } }, 503);
    }

    return c.json({ ticket: ticketStore.issue(operatorToken) });
  });

  // GET /api/dashboard/events — ticket-authenticated SSE stream for real-time dashboard updates
  app.get('/events', (c) => {
    const ticket = c.req.query('ticket');
    if (operatorToken) {
      if (!ticketStore || !ticket) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
      }
      const ticketStatus = ticketStore.consume(ticket, operatorToken);
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
