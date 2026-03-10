import type { BeastDispatchSource } from '../types.js';
import type { BeastMetrics } from './beast-metrics.js';

function key(parts: Record<string, string>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}="${value}"`)
    .join(',');
}

export class PrometheusBeastMetrics implements BeastMetrics {
  private readonly runCreated = new Map<string, number>();
  private readonly runStops = new Map<string, number>();

  recordRunCreated(definitionId: string, source: BeastDispatchSource): void {
    const labels = key({ definition_id: definitionId, source });
    this.runCreated.set(labels, (this.runCreated.get(labels) ?? 0) + 1);
  }

  recordRunStopped(definitionId: string): void {
    const labels = key({ definition_id: definitionId });
    this.runStops.set(labels, (this.runStops.get(labels) ?? 0) + 1);
  }

  render(): string {
    const lines = [
      '# TYPE beast_runs_created_total counter',
      ...[...this.runCreated.entries()].map(([labels, value]) => `beast_runs_created_total{${labels}} ${value}`),
      '# TYPE beast_run_stops_total counter',
      ...[...this.runStops.entries()].map(([labels, value]) => `beast_run_stops_total{${labels}} ${value}`),
    ];
    return `${lines.join('\n')}\n`;
  }
}
