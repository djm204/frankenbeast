import { describe, it, expect } from 'vitest'
import { generateGrafanaDashboard } from './GrafanaDashboard.js'
import type { GrafanaDashboard, GrafanaPanel } from './GrafanaDashboard.js'

// The three metric families exposed by PrometheusAdapter
const METRICS = [
  'franken_observer_tokens_total',
  'franken_observer_cost_usd_total',
  'franken_observer_spans_total',
] as const

function allExprs(dashboard: GrafanaDashboard): string[] {
  return dashboard.panels.flatMap(p => p.targets.map(t => t.expr))
}

describe('generateGrafanaDashboard', () => {
  describe('top-level structure', () => {
    it('returns a non-null object', () => {
      expect(generateGrafanaDashboard()).toBeTruthy()
    })

    it('id is null (required for Grafana import)', () => {
      expect(generateGrafanaDashboard().id).toBeNull()
    })

    it('has a non-empty uid', () => {
      const { uid } = generateGrafanaDashboard()
      expect(typeof uid).toBe('string')
      expect(uid.length).toBeGreaterThan(0)
    })

    it('uses default title "Frankenbeast Observer" when none provided', () => {
      expect(generateGrafanaDashboard().title).toBe('Frankenbeast Observer')
    })

    it('uses the provided title', () => {
      expect(generateGrafanaDashboard({ title: 'My Agent' }).title).toBe('My Agent')
    })

    it('uses the provided uid', () => {
      expect(generateGrafanaDashboard({ uid: 'my-custom-uid' }).uid).toBe('my-custom-uid')
    })

    it('includes "frankenbeast" tag by default', () => {
      expect(generateGrafanaDashboard().tags).toContain('frankenbeast')
    })

    it('uses provided tags', () => {
      const d = generateGrafanaDashboard({ tags: ['prod', 'ai'] })
      expect(d.tags).toEqual(['prod', 'ai'])
    })

    it('has a schemaVersion field', () => {
      expect(typeof generateGrafanaDashboard().schemaVersion).toBe('number')
    })

    it('has a timezone field', () => {
      expect(typeof generateGrafanaDashboard().timezone).toBe('string')
    })

    it('has a time range with from and to', () => {
      const { time } = generateGrafanaDashboard()
      expect(typeof time.from).toBe('string')
      expect(typeof time.to).toBe('string')
    })

    it('accepts a custom time range', () => {
      const d = generateGrafanaDashboard({ timeRange: { from: 'now-24h', to: 'now' } })
      expect(d.time.from).toBe('now-24h')
    })

    it('has a refresh interval', () => {
      expect(typeof generateGrafanaDashboard().refresh).toBe('string')
    })

    it('output is JSON-serialisable (roundtrips cleanly)', () => {
      const d = generateGrafanaDashboard()
      expect(() => JSON.parse(JSON.stringify(d))).not.toThrow()
      expect(JSON.parse(JSON.stringify(d)).title).toBe(d.title)
    })
  })

  describe('panels', () => {
    it('returns at least one panel', () => {
      expect(generateGrafanaDashboard().panels.length).toBeGreaterThan(0)
    })

    it('each panel has id, type, title, gridPos, and targets', () => {
      for (const panel of generateGrafanaDashboard().panels) {
        expect(typeof panel.id).toBe('number')
        expect(typeof panel.type).toBe('string')
        expect(typeof panel.title).toBe('string')
        expect(panel.gridPos).toBeTruthy()
        expect(typeof panel.gridPos.h).toBe('number')
        expect(typeof panel.gridPos.w).toBe('number')
        expect(typeof panel.gridPos.x).toBe('number')
        expect(typeof panel.gridPos.y).toBe('number')
        expect(Array.isArray(panel.targets)).toBe(true)
        expect(panel.targets.length).toBeGreaterThan(0)
      }
    })

    it('panel ids are unique positive integers', () => {
      const ids = generateGrafanaDashboard().panels.map(p => p.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
      for (const id of ids) expect(id).toBeGreaterThan(0)
    })

    it('each target has expr, legendFormat, and refId', () => {
      for (const panel of generateGrafanaDashboard().panels) {
        for (const target of panel.targets) {
          expect(typeof target.expr).toBe('string')
          expect(target.expr.length).toBeGreaterThan(0)
          expect(typeof target.legendFormat).toBe('string')
          expect(typeof target.refId).toBe('string')
        }
      }
    })

    it('panels include at least one timeseries panel', () => {
      const types = generateGrafanaDashboard().panels.map(p => p.type)
      expect(types).toContain('timeseries')
    })

    it('panels include at least one stat panel', () => {
      const types = generateGrafanaDashboard().panels.map(p => p.type)
      expect(types).toContain('stat')
    })
  })

  describe('metric coverage', () => {
    it.each(METRICS)('at least one panel references %s', metric => {
      const exprs = allExprs(generateGrafanaDashboard())
      expect(exprs.some(e => e.includes(metric))).toBe(true)
    })
  })

  describe('datasource', () => {
    it('panels default to the ${datasource} template variable', () => {
      for (const panel of generateGrafanaDashboard().panels) {
        expect(panel.datasource.uid).toBe('${datasource}')
        for (const target of panel.targets) {
          expect(target.datasource.uid).toBe('${datasource}')
        }
      }
    })

    it('uses the provided datasourceUid throughout', () => {
      const d = generateGrafanaDashboard({ datasourceUid: 'my-prom-uid' })
      for (const panel of d.panels) {
        expect(panel.datasource.uid).toBe('my-prom-uid')
        for (const target of panel.targets) {
          expect(target.datasource.uid).toBe('my-prom-uid')
        }
      }
    })

    it('templating includes a Prometheus datasource variable', () => {
      const { templating } = generateGrafanaDashboard()
      const ds = templating.list.find(v => v.name === 'datasource')
      expect(ds).toBeTruthy()
      expect(ds?.query).toBe('prometheus')
    })
  })

  describe('uid generation', () => {
    it('derives uid from title when not provided', () => {
      const d = generateGrafanaDashboard({ title: 'My Custom Title' })
      expect(d.uid).toContain('my')
      expect(d.uid).toContain('custom')
    })

    it('uid contains only url-safe characters', () => {
      const d = generateGrafanaDashboard({ title: 'Hello World! 123' })
      expect(d.uid).toMatch(/^[a-z0-9-]+$/)
    })

    it('uid is at most 40 characters', () => {
      const d = generateGrafanaDashboard({ title: 'A'.repeat(100) })
      expect(d.uid.length).toBeLessThanOrEqual(40)
    })
  })
})
