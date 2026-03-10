import { Hono } from 'hono';
import type { BeastMetrics } from '../../beasts/telemetry/beast-metrics.js';

export function metricsRoutes(metrics: BeastMetrics): Hono {
  const app = new Hono();

  app.get('/metrics', (c) => {
    c.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.body(metrics.render());
  });

  return app;
}
