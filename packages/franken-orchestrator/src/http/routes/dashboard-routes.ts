import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { SecurityConfig } from '../../middleware/security-profiles.js';

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
      // Send initial snapshot
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify(buildSnapshot(deps)),
      });

      // Keep connection alive with periodic heartbeats
      // Real event push would be wired to SkillManager/SecurityConfig change events
      const interval = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'heartbeat', data: '' });
        } catch {
          clearInterval(interval);
        }
      }, 30_000);

      // Block until client disconnects (single onAbort — Hono stores one callback, not a list)
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearInterval(interval);
          resolve();
        });
      });
    });
  });

  return app;
}
