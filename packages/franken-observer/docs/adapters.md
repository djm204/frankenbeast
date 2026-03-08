# Adapter Configuration Guide

All adapters implement the `ExportAdapter` interface (`flush / queryByTraceId / listTraceIds`).
Pick one — or stack them — depending on where you want traces to land.

---

## InMemoryAdapter

Zero-dependency, in-process store. Good for tests and local prototyping.

```ts
import { InMemoryAdapter, TraceContext } from '@frankenbeast/observer'

const adapter = new InMemoryAdapter()
const trace   = TraceContext.createTrace('my goal')
// … startSpan / endSpan …
TraceContext.endTrace(trace)

await adapter.flush(trace)
const retrieved = await adapter.queryByTraceId(trace.id)
```

---

## SQLiteAdapter

Persists traces to a local SQLite file using WAL mode and transactional span writes.
Requires `better-sqlite3` (already a package dependency).

```ts
import { SQLiteAdapter } from '@frankenbeast/observer'

const adapter = new SQLiteAdapter('./traces.db')

await adapter.flush(trace)
const ids = await adapter.listTraceIds()

adapter.close() // release the DB handle when done
```

**Notes**
- Survives process restarts — point a new `SQLiteAdapter` at the same `.db` file.
- Concurrent writes from the same process are safe (WAL + transaction batching).

---

## LangfuseAdapter

Posts OTEL-formatted trace payloads to a [Langfuse](https://langfuse.com) (or compatible
Phoenix) ingest endpoint. **Write-only** — `queryByTraceId` returns `null`.

```ts
import { LangfuseAdapter } from '@frankenbeast/observer'

const adapter = new LangfuseAdapter({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  // baseUrl defaults to 'https://cloud.langfuse.com'
  // EU region:
  // baseUrl: 'https://eu.cloud.langfuse.com',
})

await adapter.flush(trace) // throws on non-2xx response
```

**Options**

| Option      | Type     | Default                          | Description                      |
|-------------|----------|----------------------------------|----------------------------------|
| `publicKey` | `string` | —                                | Langfuse project public key      |
| `secretKey` | `string` | —                                | Langfuse project secret key      |
| `baseUrl`   | `string` | `https://cloud.langfuse.com`     | Override for EU region or Phoenix|
| `fetch`     | `FetchFn`| `globalThis.fetch`               | Injectable for testing           |

**Testing without a real Langfuse instance**

```ts
import { vi } from 'vitest'
import { LangfuseAdapter } from '@frankenbeast/observer'

const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
const adapter   = new LangfuseAdapter({ publicKey: 'pk', secretKey: 'sk', fetch: mockFetch })

await adapter.flush(trace)
expect(mockFetch).toHaveBeenCalledOnce()
```

---

## PrometheusAdapter

Accumulates token, span, and (optionally) cost counters from flushed traces and
exposes them in [Prometheus text format](https://prometheus.io/docs/instrumenting/exposition_formats/)
via `scrape()`. **Write-only** — `queryByTraceId` returns `null`.

```ts
import { PrometheusAdapter, DEFAULT_PRICING } from '@frankenbeast/observer'
import http from 'node:http'

const adapter = new PrometheusAdapter({ pricingTable: DEFAULT_PRICING })

// Flush traces as they complete
await adapter.flush(trace)

// Expose /metrics for Prometheus to scrape
http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' })
    res.end(adapter.scrape())
  }
}).listen(9091)
```

**Exposed metrics**

| Metric                              | Type    | Labels              | Description                        |
|-------------------------------------|---------|---------------------|------------------------------------|
| `franken_observer_tokens_total`     | counter | `model`, `type`     | Prompt / completion tokens         |
| `franken_observer_spans_total`      | counter | `status`            | Spans by completion status         |
| `franken_observer_cost_usd_total`   | counter | `model`             | USD cost (only if `pricingTable` provided) |

**Options**

| Option         | Type           | Default | Description                              |
|----------------|----------------|---------|------------------------------------------|
| `pricingTable` | `PricingTable` | —       | Enables `cost_usd_total` metric per model|

**Reset between scrapes** (e.g. for delta metrics)

```ts
const snapshot = adapter.scrape()
adapter.reset() // clear accumulators
```

---

## TempoAdapter

Posts OTEL-formatted trace payloads to a [Grafana Tempo](https://grafana.com/oss/tempo/)
endpoint (local or Grafana Cloud) over OTLP/HTTP. **Write-only** — `queryByTraceId` returns `null`.

```ts
import { TempoAdapter } from '@frankenbeast/observer'

// Local Tempo / OpenTelemetry Collector (no auth)
const local = new TempoAdapter({ endpoint: 'http://localhost:4318' })
await local.flush(trace)

// Grafana Cloud Tempo (Basic auth + cloud OTLP path)
const cloud = new TempoAdapter({
  endpoint: 'https://tempo-us-central1.grafana.net/tempo',
  otlpPath: '/otlp/v1/traces',       // Grafana Cloud uses this path
  basicAuth: {
    user: process.env.GRAFANA_INSTANCE_ID!,   // numeric instance ID
    password: process.env.GRAFANA_API_KEY!,
  },
})
await cloud.flush(trace)
```

**Options**

| Option      | Type            | Default          | Description                                     |
|-------------|-----------------|------------------|-------------------------------------------------|
| `endpoint`  | `string`        | —                | Base URL (trailing slash stripped automatically)|
| `otlpPath`  | `string`        | `'/v1/traces'`   | OTLP/HTTP path appended to `endpoint`           |
| `basicAuth` | `TempoBasicAuth`| —                | Omit for unauthenticated local Tempo            |
| `fetch`     | `FetchFn`       | `globalThis.fetch`| Injectable for testing                         |

**OTLP path quick reference**

| Environment              | `endpoint`                                          | `otlpPath`            |
|--------------------------|-----------------------------------------------------|-----------------------|
| Local Tempo / Collector  | `http://localhost:4318`                             | `/v1/traces` (default)|
| Grafana Cloud            | `https://tempo-{region}.grafana.net/tempo`          | `/otlp/v1/traces`     |

**Testing without a real Tempo instance**

```ts
import { vi } from 'vitest'
import { TempoAdapter } from '@frankenbeast/observer'

const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
const adapter   = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch })

await adapter.flush(trace)
const [url, init] = mockFetch.mock.calls[0]
// url  → 'http://localhost:4318/v1/traces'
// init → { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '...' }
```

---

## Stacking adapters

You can flush to multiple sinks by calling `flush` on each adapter in parallel:

```ts
import { SQLiteAdapter, LangfuseAdapter, TempoAdapter, PrometheusAdapter, DEFAULT_PRICING } from '@frankenbeast/observer'

const sqlite    = new SQLiteAdapter('./traces.db')
const langfuse  = new LangfuseAdapter({ publicKey: '…', secretKey: '…' })
const tempo     = new TempoAdapter({ endpoint: 'http://localhost:4318' })
const prom      = new PrometheusAdapter({ pricingTable: DEFAULT_PRICING })

async function exportTrace(trace: Trace) {
  await Promise.all([
    sqlite.flush(trace),
    langfuse.flush(trace),
    tempo.flush(trace),
    prom.flush(trace),
  ])
}
```
