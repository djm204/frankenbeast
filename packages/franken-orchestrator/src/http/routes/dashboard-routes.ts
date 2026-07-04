import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { SecurityConfig } from '../../middleware/security-profiles.js';

const DASHBOARD_SNAPSHOT_POLL_MS = 1_000;
const DASHBOARD_HEARTBEAT_MS = 30_000;

export interface DashboardRouteDeps {
  skillManager: SkillManager;
  getSecurityConfig: () => SecurityConfig;
  getProviders: () => Array<{ name: string; type: string; available: boolean; failoverOrder: number }>;
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

  // GET /api/dashboard — aggregated snapshot of all dashboard state
  app.get('/', (c) => {
    return c.json(buildSnapshot(deps));
  });

  // GET /api/dashboard/events — SSE stream for real-time dashboard updates
  app.get('/events', (c) => {
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
        const nextSnapshot = JSON.stringify(buildSnapshot(deps));
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
