// ── Grafana JSON schema types (subset sufficient for import) ─────────────────

export interface GrafanaDatasourceRef {
  type: string
  uid: string
}

export interface GrafanaTarget {
  datasource: GrafanaDatasourceRef
  expr: string
  legendFormat: string
  refId: string
}

export interface GrafanaGridPos {
  h: number
  w: number
  x: number
  y: number
}

export interface GrafanaPanel {
  id: number
  type: string
  title: string
  datasource: GrafanaDatasourceRef
  targets: GrafanaTarget[]
  gridPos: GrafanaGridPos
  fieldConfig?: Record<string, unknown>
  options?: Record<string, unknown>
}

export interface GrafanaVariable {
  name: string
  type: string
  label?: string
  query?: string
}

export interface GrafanaDashboard {
  id: null
  uid: string
  title: string
  tags: string[]
  timezone: string
  schemaVersion: number
  panels: GrafanaPanel[]
  templating: { list: GrafanaVariable[] }
  time: { from: string; to: string }
  refresh: string
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface GrafanaDashboardOptions {
  /** Dashboard title. Default: 'Frankenbeast Observer' */
  title?: string
  /**
   * Dashboard UID (used in URLs and for idempotent imports).
   * Default: derived from the title (lowercase, hyphen-separated, ≤40 chars).
   */
  uid?: string
  /**
   * Grafana datasource UID to wire into every panel and target.
   * Default: `'${datasource}'` — resolved via the included template variable.
   */
  datasourceUid?: string
  /** Dashboard tags. Default: ['frankenbeast'] */
  tags?: string[]
  /** Time range. Default: { from: 'now-1h', to: 'now' } */
  timeRange?: { from: string; to: string }
  /** Auto-refresh interval. Default: '30s' */
  refresh?: string
}

// ── Public API ────────────────────────────────────────────────────────────────

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
export function generateGrafanaDashboard(options: GrafanaDashboardOptions = {}): GrafanaDashboard {
  const title = options.title ?? 'Frankenbeast Observer'
  const uid = options.uid ?? slugify(title)
  const dsUid = options.datasourceUid ?? '${datasource}'
  const tags = options.tags ?? ['frankenbeast']

  const panels: GrafanaPanel[] = [
    // ── Row 1 (y=0): three stat KPIs ────────────────────────────────────────
    stat(1, 'Total Tokens', 'sum(franken_observer_tokens_total)', { h: 4, w: 8, x: 0, y: 0 }, dsUid),
    stat(2, 'Total Cost (USD)', 'sum(franken_observer_cost_usd_total)', { h: 4, w: 8, x: 8, y: 0 }, dsUid, 'currencyUSD'),
    stat(3, 'Total Spans', 'sum(franken_observer_spans_total)', { h: 4, w: 8, x: 16, y: 0 }, dsUid),

    // ── Row 2 (y=4): token burn timeseries + spans pie ───────────────────────
    timeseries(
      4,
      'Token Burn Rate',
      [{ expr: 'rate(franken_observer_tokens_total[5m])', legendFormat: '{{model}} {{type}}' }],
      { h: 8, w: 16, x: 0, y: 4 },
      dsUid,
    ),
    piechart(5, 'Spans by Status', 'franken_observer_spans_total', '{{status}}', { h: 8, w: 8, x: 16, y: 4 }, dsUid),

    // ── Row 3 (y=12): cost by model bar gauge ────────────────────────────────
    bargauge(6, 'Cost by Model (USD)', 'franken_observer_cost_usd_total', '{{model}}', { h: 8, w: 24, x: 0, y: 12 }, dsUid),
  ]

  return {
    id: null,
    uid,
    title,
    tags,
    timezone: 'browser',
    schemaVersion: 38,
    panels,
    templating: {
      list: [{ name: 'datasource', type: 'datasource', label: 'Data source', query: 'prometheus' }],
    },
    time: options.timeRange ?? { from: 'now-1h', to: 'now' },
    refresh: options.refresh ?? '30s',
  }
}

// ── Panel builders ────────────────────────────────────────────────────────────

function ds(uid: string): GrafanaDatasourceRef {
  return { type: 'prometheus', uid }
}

function target(expr: string, legendFormat: string, refId: string, dsUid: string): GrafanaTarget {
  return { datasource: ds(dsUid), expr, legendFormat, refId }
}

function stat(
  id: number,
  title: string,
  expr: string,
  gridPos: GrafanaGridPos,
  dsUid: string,
  unit?: string,
): GrafanaPanel {
  return {
    id,
    type: 'stat',
    title,
    datasource: ds(dsUid),
    targets: [target(expr, '', 'A', dsUid)],
    gridPos,
    options: {
      reduceOptions: { calcs: ['lastNotNull'] },
      orientation: 'auto',
      textMode: 'auto',
      colorMode: 'background',
    },
    fieldConfig: unit ? { defaults: { unit } } : undefined,
  }
}

function timeseries(
  id: number,
  title: string,
  targets: Array<{ expr: string; legendFormat: string }>,
  gridPos: GrafanaGridPos,
  dsUid: string,
): GrafanaPanel {
  return {
    id,
    type: 'timeseries',
    title,
    datasource: ds(dsUid),
    targets: targets.map((t, i) =>
      target(t.expr, t.legendFormat, String.fromCharCode(65 + i), dsUid),
    ),
    gridPos,
    fieldConfig: {
      defaults: { custom: { lineWidth: 1, fillOpacity: 10, spanNulls: false } },
    },
    options: {
      tooltip: { mode: 'multi', sort: 'none' },
      legend: { displayMode: 'list', placement: 'bottom' },
    },
  }
}

function piechart(
  id: number,
  title: string,
  expr: string,
  legendFormat: string,
  gridPos: GrafanaGridPos,
  dsUid: string,
): GrafanaPanel {
  return {
    id,
    type: 'piechart',
    title,
    datasource: ds(dsUid),
    targets: [target(expr, legendFormat, 'A', dsUid)],
    gridPos,
    options: {
      pieType: 'pie',
      tooltip: { mode: 'single' },
      legend: { displayMode: 'table', placement: 'right' },
    },
  }
}

function bargauge(
  id: number,
  title: string,
  expr: string,
  legendFormat: string,
  gridPos: GrafanaGridPos,
  dsUid: string,
): GrafanaPanel {
  return {
    id,
    type: 'bargauge',
    title,
    datasource: ds(dsUid),
    targets: [target(expr, legendFormat, 'A', dsUid)],
    gridPos,
    fieldConfig: { defaults: { unit: 'currencyUSD', min: 0 } },
    options: {
      reduceOptions: { calcs: ['lastNotNull'] },
      orientation: 'horizontal',
      displayMode: 'gradient',
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
