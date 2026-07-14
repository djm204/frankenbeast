# Adapter Configuration Guide

All adapters implement the `ExportAdapter` interface (`flush / queryByTraceId / listTraceIds`).
Pick one — or stack them — depending on where you want traces to land.

---

## InMemoryAdapter

Zero-dependency, in-process store. Good for tests and local prototyping.

```ts
import { InMemoryAdapter, TraceContext } from '@franken/observer'

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
import { SQLiteAdapter } from '@franken/observer'

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
import { LangfuseAdapter } from '@franken/observer'

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

| Option      | Type      | Default                      | Description                       |
|-------------|-----------|------------------------------|-----------------------------------|
| `publicKey` | `string`  | —                            | Langfuse project public key       |
| `secretKey` | `string`  | —                            | Langfuse project secret key       |
| `baseUrl`   | `string`  | `https://cloud.langfuse.com` | Override for EU region or Phoenix |
| `fetch`     | `FetchFn` | `globalThis.fetch`           | Injectable for testing            |

**Environment variables**

`LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are the recommended application-level names for the two required Langfuse credentials. The adapter does not read environment variables by itself and does not provide default credential values: callers must pass both keys into `new LangfuseAdapter({ publicKey, secretKey })`. If either variable is missing, fail fast in the application or CI job that enables Langfuse export rather than constructing the adapter with an empty string.

`LANGFUSE_PUBLIC_KEY` identifies the Langfuse project that receives the OTEL payloads. `LANGFUSE_SECRET_KEY` is paired with it and is sent as part of the adapter's HTTP Basic Authorization header (`publicKey:secretKey`). Keep the secret key in a password manager, CI secret store, or local uncommitted `.env` file; never commit it, print it in logs, or expose it to browser bundles.

Local development usually keeps Langfuse export opt-in. Store real keys in an ignored `.env` file (or equivalent shell profile), use placeholder values only when paired with a mocked `fetch`, and point `baseUrl` at the correct Langfuse region when you are testing live exports:

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
# Optional: pass baseUrl: 'https://eu.cloud.langfuse.com' in code for EU projects.
```

CI pipelines should inject masked secrets only into jobs that intentionally exercise Langfuse export wiring. Documentation, unit, and mock-transport tests should not require real Langfuse credentials.

```yaml
env:
  LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
  LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
```

**Testing without a real Langfuse instance**

```ts
import { vi } from 'vitest'
import { LangfuseAdapter } from '@franken/observer'

const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
const adapter   = new LangfuseAdapter({ publicKey: process.env.LANGFUSE_PUBLIC_KEY!, secretKey: process.env.LANGFUSE_SECRET_KEY!, fetch: mockFetch })

await adapter.flush(trace)
expect(mockFetch).toHaveBeenCalledOnce()
```

---

## PrometheusAdapter

Accumulates token, span, and (optionally) cost counters from flushed traces and
exposes them in [Prometheus text format](https://prometheus.io/docs/instrumenting/exposition_formats/)
via `scrape()`. **Write-only** — `queryByTraceId` returns `null`.

```ts
import { PrometheusAdapter, DEFAULT_PRICING } from '@franken/observer'
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

### Grafana Cloud environment variables

`GRAFANA_INSTANCE_ID` and `GRAFANA_API_KEY` are convenience inputs for the
Grafana Cloud example below; the adapter itself only receives a `basicAuth`
object. Leave both variables unset for local Tempo or an unauthenticated
OpenTelemetry Collector.

| Variable | Required for | Purpose | Default behavior |
|---|---|---|---|
| `GRAFANA_INSTANCE_ID` | Grafana Cloud Tempo | Numeric Grafana Cloud stack/Tempo instance ID used as the Basic auth username. | No default. Local examples omit `basicAuth`. |
| `GRAFANA_API_KEY` | Grafana Cloud Tempo | Grafana Cloud access policy token/API key used as the Basic auth password; grant only trace write permissions where possible. | No default. Local examples omit `basicAuth`. |

Security notes:

- Do not commit `GRAFANA_API_KEY`; keep it in `.env`, a shell secret manager, or
  your CI platform's masked secret store.
- Fail fast in application/CI wiring when either Grafana Cloud variable is
  missing so traces are not silently dropped or sent without authentication.
- Rotate the token immediately if it is printed in logs or committed.

```ts
import { TempoAdapter } from '@franken/observer'

// Local Tempo / OpenTelemetry Collector (no auth)
const local = new TempoAdapter({ endpoint: 'http://localhost:4318' })
await local.flush(trace)

// CI example: inject these from masked CI secrets.
if (!process.env.GRAFANA_INSTANCE_ID || !process.env.GRAFANA_API_KEY) {
  throw new Error('Grafana Cloud export requires GRAFANA_INSTANCE_ID and GRAFANA_API_KEY')
}

// Grafana Cloud Tempo (Basic auth + cloud OTLP gateway path)
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for Grafana Cloud Tempo exports`)
  }
  return value
}

const cloud = new TempoAdapter({
  // Copy the OTLP gateway host from your Grafana Cloud stack's OpenTelemetry tile.
  // Do not use the Tempo query endpoint (tempo-<region>.grafana.net/tempo).
  endpoint: 'https://otlp-gateway-<REGION>.grafana.net',
  otlpPath: '/otlp/v1/traces',       // Grafana Cloud OTLP gateway traces path
  basicAuth: {
    user: requireEnv('GRAFANA_INSTANCE_ID'),   // numeric instance ID
    password: requireEnv('GRAFANA_API_KEY'),
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

**Grafana Cloud environment variables**

`TempoAdapter` does not read environment variables directly; pass credentials through the `basicAuth` option when you target Grafana Cloud Tempo. The examples in this package use:

| Variable | Purpose | Default behavior |
|---|---|---|
| `GRAFANA_INSTANCE_ID` | Grafana Cloud Tempo instance/user ID used as the Basic auth username. | No default. Omit `basicAuth` for unauthenticated local Tempo, or fail fast in your app/CI if this is unset for Grafana Cloud. |
| `GRAFANA_API_KEY` | Grafana Cloud token/API key used as the Basic auth password. | No default. Required only for authenticated Grafana Cloud exports. |

For local development, prefer the unauthenticated compose/collector endpoint and do not set cloud secrets:

```ts
// Local Tempo / OpenTelemetry Collector: no Grafana Cloud credentials needed.
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'
const local = new TempoAdapter({ endpoint })
await local.flush(trace)
```

For Grafana Cloud, export both variables in the shell that starts the observer process and keep them out of source control:

```bash
export GRAFANA_INSTANCE_ID="123456"
export GRAFANA_API_KEY="glc_..."
```

In CI, store both values as masked secrets and inject them only into jobs that need to exercise Grafana Cloud export wiring:

```yaml
env:
  GRAFANA_INSTANCE_ID: ${{ secrets.GRAFANA_INSTANCE_ID }}
  GRAFANA_API_KEY: ${{ secrets.GRAFANA_API_KEY }}
```

Security notes:
- Treat `GRAFANA_API_KEY` as a secret credential. Do not commit it to `.env`, logs, snapshots, or PR comments.
- Scope the token to the minimum Grafana Cloud permissions needed to write Tempo traces, and rotate it if it is exposed.
- Prefer local unauthenticated Tempo for normal development and tests; package tests use injectable `fetch` functions and should not require real Grafana credentials.

**OTLP path quick reference**

| Environment              | `endpoint`                                          | `otlpPath`            | Auth |
|--------------------------|-----------------------------------------------------|-----------------------|------|
| Local Tempo / Collector  | `http://localhost:4318`                             | `/v1/traces` (default)| none |
| Grafana Cloud            | `https://otlp-gateway-<REGION>.grafana.net`         | `/otlp/v1/traces`     | `GRAFANA_INSTANCE_ID` / `GRAFANA_API_KEY` via `basicAuth` |

**Testing without a real Tempo instance**

```ts
import { vi } from 'vitest'
import { TempoAdapter } from '@franken/observer'

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
import { SQLiteAdapter, LangfuseAdapter, TempoAdapter, PrometheusAdapter, DEFAULT_PRICING } from '@franken/observer'

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
