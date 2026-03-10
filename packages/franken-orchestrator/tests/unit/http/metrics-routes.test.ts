import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { metricsRoutes } from '../../../src/http/routes/metrics-routes.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';

describe('metricsRoutes', () => {
  it('renders prometheus text output', async () => {
    const metrics = new PrometheusBeastMetrics();
    metrics.recordRunCreated('martin-loop', 'dashboard');

    const app = new Hono();
    app.route('/', metricsRoutes(metrics));

    const response = await app.request('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('beast_runs_created_total{definition_id="martin-loop",source="dashboard"} 1');
  });
});
