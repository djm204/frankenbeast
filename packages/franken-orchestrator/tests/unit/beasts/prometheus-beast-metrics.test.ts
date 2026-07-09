import { describe, expect, it } from 'vitest';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import type { BeastDispatchSource } from '../../../src/beasts/types.js';

describe('PrometheusBeastMetrics', () => {
  it('escapes reserved characters in label values', () => {
    const metrics = new PrometheusBeastMetrics();

    metrics.recordRunCreated(
      'bad"name',
      'dash\\board\napi' as BeastDispatchSource,
    );
    metrics.recordRunStopped('stop\\bad"name\n');

    const output = metrics.render();

    expect(output).toContain(
      'beast_runs_created_total{definition_id="bad\\"name",source="dash\\\\board\\napi"} 1',
    );
    expect(output).toContain(
      'beast_run_stops_total{definition_id="stop\\\\bad\\"name\\n"} 1',
    );
  });

  it('keeps existing happy-path label output unchanged', () => {
    const metrics = new PrometheusBeastMetrics();

    metrics.recordRunCreated('martin-loop', 'dashboard');

    expect(metrics.render()).toContain(
      'beast_runs_created_total{definition_id="martin-loop",source="dashboard"} 1',
    );
  });
});
