# @franken/observer

**MOD-05 of the Frankenbeast system** — the "Flight Data Recorder."

Captures every trace and span your agent executes, monitors token burn in real-time, runs Agent Evals to catch regressions, detects infinite loops, and ships data to Langfuse, Grafana Tempo, Prometheus, or a local SQLite file. Zero mandatory side-effects at import time — nothing starts until you construct it.

```
npm install @franken/observer
```

**Requirements:** Node.js `>=22.13.0 <23 || >=24.0.0 <26`. The only runtime dependency is `better-sqlite3` (for `SQLiteAdapter`). All other adapters use Node's built-in `fetch`.

---

## Table of contents

- [Core concepts](#core-concepts)
- [Quick start](#quick-start)
- [Core tracing](#core-tracing)
- [Token & cost tracking](#token--cost-tracking)
- [Export backends](#export-backends)
- [OTEL serialisation](#otel-serialisation)
- [Evaluation framework](#evaluation-framework)
- [Incident response](#incident-response)
- [External adapters](#external-adapters)
- [HITL webhook delivery](#hitl-webhook-delivery)
- [Local trace viewer](#local-trace-viewer)
- [Grafana dashboard](#grafana-dashboard)
- [Testing](#testing)
- [Building](#building)

---

## Core concepts

| Term | Description |
|---|---|
| **Root Trace** | Top-level unit tied to a single user goal |
| **Span** | One step taken by the agent (tool call, LLM call, planning step) |
| **Sub-Span** | A child span nested inside another (set `parentSpanId`) |
| **Thought Block** | Captured reasoning attached to a span as ordered strings |
| **Circuit Breaker** | Non-blocking budget guard that fires an event at a cost threshold |
| **Golden Trace** | A recorded successful trace used as a regression baseline |
| **Post-Mortem** | Markdown report auto-generated when a loop is detected and interrupted |

---

## Quick start

```ts
import {
  TraceContext,
  SpanLifecycle,
  SQLiteAdapter,
  CircuitBreaker,
  LoopDetector,
  DEFAULT_PRICING,
} from '@franken/observer'

// 1. Create a trace for the user's goal
const trace = TraceContext.createTrace('Research quantum computing papers')

// 2. Record each agent step as a span
const span = TraceContext.startSpan(trace, { name: 'search-arxiv' })
SpanLifecycle.recordTokenUsage(span, {
  promptTokens: 1200,
  completionTokens: 400,
  model: 'claude-sonnet-4-6',
})
TraceContext.endSpan(span)

// 3. End the trace
TraceContext.endTrace(trace)

// 4. Persist to SQLite
const db = new SQLiteAdapter('./traces.db')
await db.flush(trace)
```

---

## Core tracing

### `TraceContext`

Static object for creating and managing traces and spans.

```ts
import { TraceContext } from '@franken/observer'

// Create a root trace
const trace = TraceContext.createTrace('Summarise customer feedback')
// → { id: uuid, goal: string, status: 'active', startedAt: number, spans: [] }

// Start a span
const span = TraceContext.startSpan(trace, { name: 'fetch-tickets' })

// Start a child span (nesting)
const child = TraceContext.startSpan(trace, {
  name: 'call-zendesk-api',
  parentSpanId: span.id,
})

// End a span (success)
TraceContext.endSpan(child)

// End a span with an error
TraceContext.endSpan(span, { status: 'error', errorMessage: 'API timeout' })

// End the trace
TraceContext.endTrace(trace)
```

`endSpan` also accepts an optional `LoopDetector` as a third argument — see [Incident response](#incident-response).

### `SpanLifecycle`

Enriches active spans with metadata, thought blocks, and token usage.

```ts
import { SpanLifecycle } from '@franken/observer'

// Attach arbitrary key/value metadata
SpanLifecycle.setMetadata(span, { tool: 'web-search', query: 'LLM benchmarks' })

// Capture agent reasoning
SpanLifecycle.addThoughtBlock(span, 'I should search for recent papers first.')
SpanLifecycle.addThoughtBlock(span, 'The user probably wants 2024+ results.')

// Record token usage (feeds TokenCounter if provided)
SpanLifecycle.recordTokenUsage(span, {
  promptTokens: 800,
  completionTokens: 250,
  model: 'claude-opus-4-6',
})
// span.metadata now contains promptTokens, completionTokens, totalTokens, model
```

All `SpanLifecycle` methods throw if called on a non-active span.

### Core types

```ts
import type { Trace, Span, SpanStatus, TraceStatus } from '@franken/observer'

// SpanStatus: 'active' | 'completed' | 'error'
// TraceStatus: 'active' | 'completed' | 'error'
```

---

## Token & cost tracking

### `TokenCounter`

Accumulates per-model token usage across multiple spans.

```ts
import { TokenCounter } from '@franken/observer'

const counter = new TokenCounter()

counter.record({ model: 'claude-sonnet-4-6', promptTokens: 500, completionTokens: 200 })
counter.record({ model: 'claude-sonnet-4-6', promptTokens: 300, completionTokens: 100 })
counter.record({ model: 'claude-opus-4-6',   promptTokens: 100, completionTokens:  50 })

counter.totalsFor('claude-sonnet-4-6')
// → { promptTokens: 800, completionTokens: 300, totalTokens: 1100 }

counter.grandTotal()
// → { promptTokens: 900, completionTokens: 350, totalTokens: 1250 }

counter.allModels()  // → ['claude-sonnet-4-6', 'claude-opus-4-6']
counter.reset()
```

Pass a `TokenCounter` to `SpanLifecycle.recordTokenUsage` to feed it automatically:

```ts
const counter = new TokenCounter()
SpanLifecycle.recordTokenUsage(span, { promptTokens: 500, completionTokens: 200, model: 'claude-sonnet-4-6' }, counter)
```

### `CostCalculator`

Calculates USD cost from token records using a configurable pricing table.

```ts
import { CostCalculator, DEFAULT_PRICING } from '@franken/observer'

const calc = new CostCalculator(DEFAULT_PRICING)

calc.calculate({ model: 'claude-sonnet-4-6', promptTokens: 1_000_000, completionTokens: 500_000 })
// → 10.5  (1M × $3 + 0.5M × $15)

// Sum across all models from a TokenCounter snapshot.
// totalCost expects per-model TokenRecord entries, not grandTotal().
const records = counter.allModels().map((model) => ({
  model,
  promptTokens: counter.totalsFor(model).promptTokens,
  completionTokens: counter.totalsFor(model).completionTokens,
}))
calc.totalCost(records)

// Extend the pricing table
const myPricing = { ...DEFAULT_PRICING, 'my-local-model': { promptPerMillion: 0, completionPerMillion: 0 } }
const customCalc = new CostCalculator(myPricing)
```

Default pricing (USD, 2025-Q4):

| Model | Prompt / M | Completion / M |
|---|---|---|
| `claude-opus-4-6` | $15.00 | $75.00 |
| `claude-sonnet-4-6` | $3.00 | $15.00 |
| `claude-haiku-4-5` | $0.80 | $4.00 |
| `claude` (alias for sonnet) | $3.00 | $15.00 |
| `gpt-4o` | $5.00 | $15.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `gemini-2.0-flash` | $0.10 | $0.40 |
| `gemini` (alias for flash) | $0.10 | $0.40 |
| `codex` | $5.00 | $15.00 |
| `aider` (uses sonnet by default) | $3.00 | $15.00 |

### `CircuitBreaker`

Non-blocking budget guard. Emits an event when cumulative spend exceeds the limit — never throws, never blocks the agent.

```ts
import { CircuitBreaker } from '@franken/observer'

const breaker = new CircuitBreaker({ limitUsd: 5.0 })

breaker.on('limit-reached', ({ spendUsd, limitUsd }) => {
  console.warn(`Budget exceeded: $${spendUsd.toFixed(4)} > $${limitUsd}`)
  // pause the agent, alert the user, etc.
})

// Call after each LLM step
const result = breaker.check(currentTotalCostUsd)
if (result.tripped) {
  // handler already fired; you can also gate here
}
```

### `ModelAttribution`

Tracks cost vs success rate per model — useful for comparing models in production.

```ts
import { ModelAttribution, DEFAULT_PRICING } from '@franken/observer'

const attribution = new ModelAttribution(DEFAULT_PRICING)

attribution.record({ model: 'claude-sonnet-4-6', promptTokens: 500, completionTokens: 200, success: true })
attribution.record({ model: 'claude-opus-4-6',   promptTokens: 200, completionTokens: 100, success: false })

attribution.report()
// → [
//     { model: 'claude-sonnet-4-6', totalCalls: 1, successfulCalls: 1, failedCalls: 0, successRate: 1.0, totalCostUsd: 0.0045 },
//     { model: 'claude-opus-4-6',   totalCalls: 1, successfulCalls: 0, failedCalls: 1, successRate: 0.0, totalCostUsd: 0.0105 },
//   ]
```

---

## Export backends

All backends implement the `ExportAdapter` interface:

```ts
interface ExportAdapter {
  flush(trace: Trace): Promise<void>
  queryByTraceId(traceId: string): Promise<Trace | null>
  listTraceIds(): Promise<string[]>
}
```

### `InMemoryAdapter`

Zero-dependency, in-process store. Good for tests and prototyping.

```ts
import { InMemoryAdapter } from '@franken/observer'

// Retains the most recent 1000 traces by default. Older traces are evicted
// from queryByTraceId() / listTraceIds(); use maxTraces: Infinity only for
// legacy test fixtures that intentionally need unbounded retention.
const adapter = new InMemoryAdapter({ maxTraces: 1000 })
await adapter.flush(trace)

const retrieved = await adapter.queryByTraceId(trace.id)
const allIds    = await adapter.listTraceIds()
adapter.clear() // explicit cleanup hook for long-lived processes/tests
```

### `SQLiteAdapter`

Persists traces to a local `.db` file. Uses WAL mode and transactional span writes. Survives process restarts.

```ts
import { SQLiteAdapter } from '@franken/observer'

const adapter = new SQLiteAdapter('./traces.db')
await adapter.flush(trace)

// Reconstruct after restart
const adapter2  = new SQLiteAdapter('./traces.db')
const recovered = await adapter2.queryByTraceId(trace.id)

adapter.close() // release the SQLite handle
```

### `TranscriptRetentionAdapter`

Prompt and tool transcripts can contain private user data, secrets, and operator context. Wrap any trace backend with `TranscriptRetentionAdapter` to control whether transcript fields are retained, how long they remain readable, how they are redacted, and what access level operators should treat the retained data as.

Safe defaults use `mode: 'redacted'`, `redactionLevel: 'mask'`, `ttlMs: 24h`, and `accessLevel: 'restricted'`. The policy covers trace goals/prompts, tool inputs, tool outputs, span errors, summaries, and thought blocks.

```ts
import { SQLiteAdapter, TranscriptRetentionAdapter } from '@franken/observer'

const db = new SQLiteAdapter('./traces.db')
const adapter = new TranscriptRetentionAdapter({
  adapter: db,
  ttlMs: 6 * 60 * 60 * 1000,
  retainedFields: {
    toolOutputs: false, // keep debugging shape without retaining raw tool output
  },
})

await adapter.flush(trace)
console.log(adapter.describePolicy()) // mode, ttlMs, accessLevel, retainedFields
await adapter.cleanupExpired()
```

Use `mode: 'disabled'` for sensitive lanes that should not persist transcripts at all. Use `mode: 'raw'` with `redactionLevel: 'none'` only as an explicit operator override for short-lived local debugging.

### Stacking adapters

```ts
await Promise.all([
  sqlite.flush(trace),
  langfuse.flush(trace),
  tempo.flush(trace),
  prom.flush(trace),
])
```

---

## OTEL serialisation

Converts a `Trace` to an OpenTelemetry `ResourceSpans` payload.

```ts
import { OTELSerializer } from '@franken/observer'

const payload = OTELSerializer.serializeTrace(trace)
// → { resourceSpans: [{ resource: {...}, scopeSpans: [{ scope: {...}, spans: [...] }] }] }
```

Metadata values are typed as OTEL attributes (`intValue`, `doubleValue`, `stringValue`, `boolValue`). Thought blocks are joined with `\n` into a single `thoughtBlocks` attribute. Timestamps are converted from milliseconds to nanoseconds.

---

## Evaluation framework

### `EvalRunner`

Runs any eval safely, catching thrown errors as `fail` results.

```ts
import { EvalRunner } from '@franken/observer'

const result  = await EvalRunner.run(myEval, input)
const results = await EvalRunner.runAll([eval1, eval2, eval3], input)
```

`EvalResult` shape:

```ts
{
  evalName: string
  status: 'pass' | 'fail' | 'skip'
  score?: number    // 0–1
  reason?: string
  details?: Record<string, unknown>
}
```

### `ToolCallAccuracyEval`

Detects wrong tool names, missing required parameters, and ghost (hallucinated) parameters.

```ts
import { ToolCallAccuracyEval, EvalRunner } from '@franken/observer'

const eval_ = new ToolCallAccuracyEval()

const result = await EvalRunner.run(eval_, {
  actual: {
    tool: 'web_search',
    params: { query: 'LLM benchmarks', hallucinated_param: true },
  },
  schema: {
    tool: 'web_search',
    required: ['query'],
    allowed: ['query', 'num_results'],
  },
})
// → { status: 'fail', reason: 'Ghost params detected: hallucinated_param.', details: { ghostParams: ['hallucinated_param'] } }
```

### `ArchitecturalAdherenceEval`

Validates generated code or text against a set of Architecture Decision Record (ADR) rules.

```ts
import { ArchitecturalAdherenceEval, EvalRunner } from '@franken/observer'

const eval_ = new ArchitecturalAdherenceEval()

const result = await EvalRunner.run(eval_, {
  output: generatedCode,
  rules: [
    {
      name: 'no-any',
      description: 'TypeScript: no explicit `any` type',
      check: output => !output.includes(': any'),
    },
    {
      name: 'use-const',
      description: 'Prefer const over let where possible',
      check: output => !output.includes('let '),
    },
  ],
})
// → { status: 'fail', score: 0.5, details: { violatedRules: ['use-const'] } }
```

### `GoldenTraceEval`

Regression eval — compares the actual trace's span sequence against a recorded golden fixture. Only span names are compared; latency and token counts are allowed to vary.

```ts
import { GoldenTraceEval, EvalRunner } from '@franken/observer'

const eval_ = new GoldenTraceEval()

// Fixture can be loaded from JSON
const golden = {
  goal: 'Research AI safety papers',
  spans: [
    { name: 'plan' },
    { name: 'search_web' },
    { name: 'read_paper' },
    { name: 'summarise' },
    { name: 'write_report' },
  ],
}

const result = await EvalRunner.run(eval_, { actual: trace, golden })
// → { status: 'pass', score: 1.0 }
// → { status: 'fail', score: 0.8, details: { missingSpans: ['summarise'] } }
```

### `LLMJudgeEval`

LLM-as-a-Judge eval with a configurable, mockable judge function.

```ts
import { LLMJudgeEval, EvalRunner } from '@franken/observer'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const eval_ = new LLMJudgeEval({
  name: 'answer-quality',
  buildPrompt: input => `Rate the quality of this agent response 0–1:\n\n${input}`,
  judge: async prompt => {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    })
    // Parse score and reason from response
    return { score: 0.85, reason: 'Clear and accurate.' }
  },
  passThreshold: 0.7,
})

const result = await EvalRunner.run(eval_, agentOutput)
```

**Testing with a mock judge** (no real LLM calls):

```ts
import { vi } from 'vitest'

const mockJudge = vi.fn().mockResolvedValue({ score: 0.9, reason: 'Great.' })
const eval_ = new LLMJudgeEval({ name: 'test', buildPrompt: s => s, judge: mockJudge })
```

---

## Incident response

### `LoopDetector`

Detects repeating span-name patterns using a sliding-window comparison. Non-blocking — fires events, never throws.

```ts
import { LoopDetector } from '@franken/observer'

const detector = new LoopDetector({
  windowSize: 3,       // spans in one repeating unit
  repeatThreshold: 3,  // how many consecutive repetitions trigger detection
})

detector.on('loop-detected', ({ detectedPattern, repetitions }) => {
  console.error(`Loop detected: ${detectedPattern.join(' → ')} (×${repetitions})`)
})

// Call on every span end:
detector.check(span.name)

// Or integrate directly into TraceContext.endSpan:
TraceContext.endSpan(span, {}, detector)

detector.reset() // clear history between traces
```

### `InterruptEmitter`

Delivers `InterruptSignal` objects to registered handlers with error isolation — one broken handler never silences the others.

```ts
import { InterruptEmitter } from '@franken/observer'

const emitter = new InterruptEmitter()

emitter.on('interrupt', signal => {
  console.error(`Interrupt for trace ${signal.traceId}`)
  // signal: { traceId, detectedPattern, repetitions, timestamp }
})

// Wire to LoopDetector
detector.on('loop-detected', result => {
  emitter.emit({ traceId: trace.id, ...result, timestamp: Date.now() })
})
```

### `PostMortemGenerator`

Generates a Markdown post-mortem report when a loop is detected.

```ts
import { PostMortemGenerator } from '@franken/observer'

const generator = new PostMortemGenerator({ outputDir: './post-mortems' })

// Pure content generation (no I/O)
const markdown = generator.generateContent(trace, signal)

// Write to disk — returns the file path
const filePath = await generator.generate(trace, signal)
// → './post-mortems/post-mortem-<sha256-trace-id>-<timestamp>.md'
```

**Full incident pipeline:**

```ts
import { LoopDetector, InterruptEmitter, PostMortemGenerator, TraceContext } from '@franken/observer'

const detector  = new LoopDetector()
const emitter   = new InterruptEmitter()
const generator = new PostMortemGenerator({ outputDir: './post-mortems' })

detector.on('loop-detected', result => {
  emitter.emit({ traceId: trace.id, ...result, timestamp: Date.now() })
})

emitter.on('interrupt', async signal => {
  const path = await generator.generate(trace, signal)
  console.error(`Post-mortem written to ${path}`)
})

// Wire into every endSpan call:
for (const name of agentStepNames) {
  const span = TraceContext.startSpan(trace, { name })
  // ... agent work ...
  TraceContext.endSpan(span, {}, detector)
}
```

---

## External adapters

All HTTP adapters are **write-only** — `queryByTraceId` returns `null`, `listTraceIds` returns `[]`. Use `SQLiteAdapter` or `InMemoryAdapter` for reads.

### `LangfuseAdapter`

Posts OTEL payloads to [Langfuse](https://langfuse.com) or a compatible Phoenix instance.

```ts
import { LangfuseAdapter } from '@franken/observer'

const adapter = new LangfuseAdapter({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  // EU region:
  // baseUrl: 'https://eu.cloud.langfuse.com',
})

await adapter.flush(trace)
```

`LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are caller-managed credentials; `LangfuseAdapter` does not read them automatically and has no default key values. `publicKey` identifies the Langfuse project, while `secretKey` is sent with it in the Basic Authorization header. Keep the secret key in local/CI secret stores, never commit it or expose it to browser bundles, and fail fast before constructing the adapter if a live-export job is missing either value. For local development, prefer an ignored `.env` file or shell profile and use placeholder values only with a mocked `fetch`. CI should inject masked `LANGFUSE_*` secrets only into jobs that intentionally test live Langfuse export wiring; unit and documentation checks should continue to run without real credentials.

See the repository copy of [`packages/franken-observer/docs/adapters.md`](https://github.com/djm204/frankenbeast/blob/main/packages/franken-observer/docs/adapters.md#langfuseadapter) for the full environment-variable reference, local development example, and CI snippet.

### `TempoAdapter`

Posts OTEL payloads to [Grafana Tempo](https://grafana.com/oss/tempo/) over OTLP/HTTP.

`GRAFANA_INSTANCE_ID` and `GRAFANA_API_KEY` are only needed when exporting traces
to Grafana Cloud Tempo. `GRAFANA_INSTANCE_ID` is the numeric Grafana Cloud stack
or Tempo instance ID used as the Basic auth username, and `GRAFANA_API_KEY` is a
Grafana Cloud access policy token/API key with permission to write traces. Local
Tempo and OpenTelemetry Collector endpoints do not use either variable; omit
`basicAuth` entirely and the adapter sends unauthenticated OTLP/HTTP requests.

Keep `GRAFANA_API_KEY` out of source control. Store it in a local `.env`, shell
secret manager, or CI secret store, and mask it in logs. Rotate the key if it is
printed or committed. A missing value should fail fast in your own wiring before
constructing a Grafana Cloud adapter.

```ts
import { TempoAdapter } from '@franken/observer'

// Local Tempo / OpenTelemetry Collector
const local = new TempoAdapter({ endpoint: 'http://localhost:4318' })

// CI example: export these from the CI secret store, not from repository files.
if (!process.env.GRAFANA_INSTANCE_ID || !process.env.GRAFANA_API_KEY) {
  throw new Error('Grafana Cloud export requires GRAFANA_INSTANCE_ID and GRAFANA_API_KEY')
}

// Grafana Cloud Tempo
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
  otlpPath: '/otlp/v1/traces',
  basicAuth: {
    user: requireEnv('GRAFANA_INSTANCE_ID'),
    password: requireEnv('GRAFANA_API_KEY'),
  },
})

await cloud.flush(trace)
```

`TempoAdapter` does not read environment variables by itself; the Grafana Cloud example above passes them into `basicAuth` from the caller. `GRAFANA_INSTANCE_ID` is the Grafana Cloud Tempo instance/user ID used as the Basic auth username, and `GRAFANA_API_KEY` is the Grafana Cloud token/API key used as the Basic auth password. Neither variable has a package default: omit `basicAuth` for unauthenticated local Tempo, or fail fast in your application/CI if either value is missing for a Grafana Cloud export.

Keep `GRAFANA_API_KEY` in a secret store, never commit it to `.env` files or logs, and scope/rotate it like any other production credential. Local development and tests should prefer the unauthenticated `http://localhost:4318` endpoint with injectable `fetch` mocks; CI pipelines that exercise Grafana Cloud wiring should inject masked secrets only for those jobs:

```yaml
env:
  GRAFANA_INSTANCE_ID: ${{ secrets.GRAFANA_INSTANCE_ID }}
  GRAFANA_API_KEY: ${{ secrets.GRAFANA_API_KEY }}
```

See the repository copy of [`packages/franken-observer/docs/adapters.md`](https://github.com/djm204/frankenbeast/blob/main/packages/franken-observer/docs/adapters.md#tempoadapter) for the full Grafana Cloud environment-variable reference, local-development example, and CI notes.

### `PrometheusAdapter`

Accumulates token, span, and cost counters from flushed traces and exposes them in [Prometheus text format](https://prometheus.io/docs/instrumenting/exposition_formats/) via `scrape()`.

```ts
import { PrometheusAdapter, DEFAULT_PRICING } from '@franken/observer'
import http from 'node:http'

const prom = new PrometheusAdapter({ pricingTable: DEFAULT_PRICING })

await prom.flush(trace)

// Expose /metrics
http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' })
    res.end(prom.scrape())
  }
}).listen(9091)
```

**Exposed metrics:**

| Metric | Labels | Description |
|---|---|---|
| `franken_observer_tokens_total` | `model`, `type` | Prompt / completion tokens |
| `franken_observer_spans_total` | `status` | Spans by status |
| `franken_observer_cost_usd_total` | `model` | USD cost (requires `pricingTable`) |

```ts
prom.reset() // clear accumulators between scrape windows
```

---

## HITL webhook delivery

`WebhookNotifier` delivers HITL signals (circuit-breaker trips, loop detections) to external systems over HTTP. Any JSON-serialisable payload is accepted.

```ts
import { WebhookNotifier, CircuitBreaker, LoopDetector } from '@franken/observer'

const notifier = new WebhookNotifier({
  url: process.env.SLACK_WEBHOOK_URL!,
  // Required allowlist: the configured target URL must resolve to one of these origins.
  allowedTargetOrigins: ['https://hooks.slack.com'],
  // Optional extra headers (auth, custom content-type, etc.)
  headers: { 'X-Source': 'frankenbeast' },
})

// Wire to CircuitBreaker
const breaker = new CircuitBreaker({ limitUsd: 10.0 })
breaker.on('limit-reached', result => {
  void notifier.send({ type: 'circuit-breaker', ...result })
    .catch(err => console.error('Webhook failed', err))
})

// Wire to LoopDetector
const detector = new LoopDetector()
detector.on('loop-detected', result => {
  void notifier.send({ type: 'loop-detected', ...result })
    .catch(err => console.error('Webhook failed', err))
})
```

`send()` throws on non-2xx responses and network errors. For fire-and-forget use inside event handlers, handle rejections with `.catch()` or `void`.

Webhook targets are deny-by-default: configure `allowedTargetOrigins` with the trusted webhook origins that may receive HITL payloads. The configured `url` must resolve to one of those origins before any network request is attempted, and redirects are not followed automatically so an allowlisted endpoint cannot forward the POST body to an unlisted origin. Legacy deployments can set `allowUnlistedTarget: true` as an explicit unsafe opt-out while they migrate to an allowlist.

---

## Local trace viewer

`TraceServer` serves a self-contained HTML trace viewer over a local HTTP server (Node built-ins only, no external dependencies).

```ts
import { TraceServer, SQLiteAdapter } from '@franken/observer'

const adapter = new SQLiteAdapter('./traces.db')
const server  = new TraceServer({ adapter, port: 4040 })

await server.start()
process.stdout.write(`Trace viewer: ${server.url}`)
// → http://localhost:4040

// Later:
await server.stop()
```

**Routes:**

| Route | Response |
|---|---|
| `GET /` | Self-contained HTML page (dark theme, no CDN) |
| `GET /api/traces` | `{ traces: TraceSummary[] }` — id, goal, status, spanCount, startedAt |
| `GET /api/traces/:id` | Full `Trace` JSON, or `404 { error }` |

Works with any `ExportAdapter` — pass an `InMemoryAdapter` for ephemeral sessions or a `SQLiteAdapter` for persistent history.

---

## Grafana dashboard

`generateGrafanaDashboard()` returns a ready-to-import Grafana dashboard JSON covering all three `PrometheusAdapter` metric families.

```ts
import { generateGrafanaDashboard } from '@franken/observer'
import { writeFileSync } from 'node:fs'

const dashboard = generateGrafanaDashboard({
  title: 'My Agent',
  // uid defaults to slugified title
  // datasourceUid defaults to '${datasource}' template variable
  tags: ['production', 'frankenbeast'],
  timeRange: { from: 'now-6h', to: 'now' },
  refresh: '1m',
})

writeFileSync('dashboard.json', JSON.stringify(dashboard, null, 2))
// Grafana → Dashboards → Import → Upload JSON
```

**Included panels:**

| Panel | Type | Metric |
|---|---|---|
| Total Tokens | stat | `sum(franken_observer_tokens_total)` |
| Total Cost (USD) | stat | `sum(franken_observer_cost_usd_total)` |
| Total Spans | stat | `sum(franken_observer_spans_total)` |
| Token Burn Rate | timeseries | `rate(franken_observer_tokens_total[5m])` by model+type |
| Spans by Status | piechart | `franken_observer_spans_total` by status |
| Cost by Model | bargauge | `franken_observer_cost_usd_total` by model |

The dashboard uses a `datasource` template variable so it works in any Grafana instance without hardcoded UIDs.

---

## Testing

```bash
# Unit tests (fast, no I/O)
npm test

# Integration tests (real SQLite, real HTTP)
INTEGRATION=true npm run test:integration

# Eval suite (included in CI via the root test:ci script)
EVAL=true npm run test:eval

# Watch mode
npm run test:watch
```

All observer test commands fail when their selected glob discovers zero tests. This is intentional: unit, integration, and eval suites should surface renamed or drifted test files instead of reporting a successful empty run.

The package ships an extensive unit test suite. All adapters and integrations are tested with injectable `fetch` functions — no network calls in CI.

---

## Building

```bash
npm run build       # tsc → dist/ (ESM, declarations, and maps)
npm run typecheck   # tsc --noEmit
```

Output:

```
dist/index.js       # ESM entrypoint
dist/index.js.map   # ESM source map
dist/index.d.ts     # TypeScript declarations
dist/index.d.ts.map # TypeScript declaration map
```

The build is plain `tsc` and the output is **ESM-only** (`"type": "module"`). The package does **not** emit CommonJS artifacts such as `dist/index.cjs` or `dist/index.d.cts`, and consumers must use `import` (or a dynamic `import()` from CJS).

---

## Licence

MIT
