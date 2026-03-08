export interface GrafanaDatasourceRef {
    type: string;
    uid: string;
}
export interface GrafanaTarget {
    datasource: GrafanaDatasourceRef;
    expr: string;
    legendFormat: string;
    refId: string;
}
export interface GrafanaGridPos {
    h: number;
    w: number;
    x: number;
    y: number;
}
export interface GrafanaPanel {
    id: number;
    type: string;
    title: string;
    datasource: GrafanaDatasourceRef;
    targets: GrafanaTarget[];
    gridPos: GrafanaGridPos;
    fieldConfig?: Record<string, unknown>;
    options?: Record<string, unknown>;
}
export interface GrafanaVariable {
    name: string;
    type: string;
    label?: string;
    query?: string;
}
export interface GrafanaDashboard {
    id: null;
    uid: string;
    title: string;
    tags: string[];
    timezone: string;
    schemaVersion: number;
    panels: GrafanaPanel[];
    templating: {
        list: GrafanaVariable[];
    };
    time: {
        from: string;
        to: string;
    };
    refresh: string;
}
export interface GrafanaDashboardOptions {
    /** Dashboard title. Default: 'Frankenbeast Observer' */
    title?: string;
    /**
     * Dashboard UID (used in URLs and for idempotent imports).
     * Default: derived from the title (lowercase, hyphen-separated, ≤40 chars).
     */
    uid?: string;
    /**
     * Grafana datasource UID to wire into every panel and target.
     * Default: `'${datasource}'` — resolved via the included template variable.
     */
    datasourceUid?: string;
    /** Dashboard tags. Default: ['frankenbeast'] */
    tags?: string[];
    /** Time range. Default: { from: 'now-1h', to: 'now' } */
    timeRange?: {
        from: string;
        to: string;
    };
    /** Auto-refresh interval. Default: '30s' */
    refresh?: string;
}
/**
 * Generates a ready-to-import Grafana dashboard JSON covering the three
 * metric families exposed by PrometheusAdapter:
 *
 *   - `franken_observer_tokens_total`    → stat + timeseries panels
 *   - `franken_observer_cost_usd_total`  → stat + bar-gauge panels
 *   - `franken_observer_spans_total`     → stat + pie-chart panel
 *
 * The output is a plain object — pipe it through JSON.stringify and write
 * to a `.json` file, then import via Grafana → Dashboards → Import.
 *
 * ```ts
 * import { generateGrafanaDashboard } from '@frankenbeast/observer'
 * import { writeFileSync } from 'node:fs'
 *
 * writeFileSync('dashboard.json', JSON.stringify(generateGrafanaDashboard(), null, 2))
 * ```
 */
export declare function generateGrafanaDashboard(options?: GrafanaDashboardOptions): GrafanaDashboard;
//# sourceMappingURL=GrafanaDashboard.d.ts.map