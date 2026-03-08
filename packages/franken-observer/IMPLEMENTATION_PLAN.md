# Implementation Plan — franken-observer (MOD-05)

> Methodology: TDD · Tracer Bullets · Atomic Commits · Logically-grouped PRs

---

## Phase 0 — Scaffold (PR-00)

**Goal:** Runnable project with working CI gate before any feature code.

### FB-00 `feat/fb-00-scaffold`

Commits (in order):
1. `chore(scaffold): init package.json, tsconfig, tsup config`
2. `chore(ci): add vitest + tsc typecheck scripts`
3. `chore(ci): add GitHub Actions workflow (typecheck + test)`
4. `docs(scaffold): add CLAUDE.md and IMPLEMENTATION_PLAN.md`

**Done when:** `npm test` passes (empty test suite), `tsc --noEmit` passes, CI green.

---

## Phase 1 — Core Tracing (PR-01)

**Goal:** A single root trace with child spans can be created, queried, and serialised.
Tracer Bullet: `createTrace() → startSpan() → endSpan() → toOTEL()` works end-to-end.

### FB-01 `feat/fb-01-core-tracing`

**Data models first (TDD):**

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(core): TraceContext shape and lifecycle` | `src/core/TraceContext.test.ts` | Failing tests for create/start/end |
| `feat(core): TraceContext + Span data models` | `src/core/TraceContext.ts`, `src/core/types.ts` | Minimal passing impl |
| `test(core): SpanLifecycle attach metadata and thought blocks` | `src/core/SpanLifecycle.test.ts` | Failing |
| `feat(core): SpanLifecycle with metadata + thought blocks` | `src/core/SpanLifecycle.ts` | Passing |
| `test(core): toOTEL serialiser round-trip` | `src/export/OTELSerializer.test.ts` | Failing |
| `feat(export): OTELSerializer — trace → OTEL spans` | `src/export/OTELSerializer.ts` | Passing |
| `chore(core): export public API from index.ts` | `src/index.ts` | Wire up exports |

**Done when:** Every span attribute (latency, token counts, thought blocks, parent-child hierarchy) survives a `toOTEL()` round-trip in tests.

---

## Phase 2 — Token & Cost Tracking (PR-02)

**Goal:** Every span records token usage; a configurable circuit breaker halts execution at budget limit.
Tracer Bullet: attach tokens to a span → accumulate cost → trigger HITL alert at threshold.

### FB-02 `feat/fb-02-token-cost`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(cost): TokenCounter accumulates per-model usage` | `src/cost/TokenCounter.test.ts` | Failing |
| `feat(cost): TokenCounter` | `src/cost/TokenCounter.ts` | Passing |
| `test(cost): CostCalculator uses configurable pricing table` | `src/cost/CostCalculator.test.ts` | Failing |
| `feat(cost): CostCalculator with default Claude + GPT-4o pricing` | `src/cost/CostCalculator.ts`, `src/cost/defaultPricing.ts` | Passing |
| `test(cost): CircuitBreaker fires HITL event at threshold` | `src/cost/CircuitBreaker.test.ts` | Failing |
| `feat(cost): CircuitBreaker — event-based, non-blocking` | `src/cost/CircuitBreaker.ts` | Passing |
| `test(cost): ModelAttributionReport aggregates cost vs success per model` | `src/cost/ModelAttribution.test.ts` | Failing |
| `feat(cost): ModelAttribution` | `src/cost/ModelAttribution.ts` | Passing |
| `refactor(core): integrate TokenCounter into SpanLifecycle` | `src/core/SpanLifecycle.ts` | Wire cost into spans |

**Done when:** A span with 1000 tokens on a $0.50 budget fires a `circuit-breaker:limit-reached` event without throwing.

---

## Phase 3 — OTEL Export + SQLite Backend (PR-03)

**Goal:** Traces flow from memory into a local SQLite DB and can be queried back.
Tracer Bullet: `createTrace() → endSpan() → flush() → queryByTraceId()` works against real SQLite.

### FB-03 `feat/fb-03-otel-sqlite`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(export): ExportAdapter interface contract` | `src/export/ExportAdapter.test.ts` | Failing |
| `feat(export): ExportAdapter interface + InMemoryAdapter` | `src/export/ExportAdapter.ts`, `src/export/InMemoryAdapter.ts` | Passing |
| `test(adapters): SQLiteAdapter stores and retrieves spans` | `src/adapters/sqlite/SQLiteAdapter.integration.test.ts` | Failing (needs real file) |
| `feat(adapters): SQLiteAdapter — write + query spans` | `src/adapters/sqlite/SQLiteAdapter.ts`, `src/adapters/sqlite/schema.ts` | Passing |
| `test(adapters): SQLiteAdapter handles concurrent writes` | same file | Edge-case tests |
| `feat(adapters): SQLiteAdapter WAL mode + transaction batching` | `src/adapters/sqlite/SQLiteAdapter.ts` | Performance |
| `chore(export): wire SQLiteAdapter as default dev backend` | `src/index.ts` | Config |

**Done when:** Integration test confirms a 10-span trace survives a process restart (persisted and re-read from `.db` file).

---

## Phase 4 — Evaluation Framework (PR-04)

**Goal:** Deterministic evals pass/fail automatically; LLM-judge evals are gated.
Tracer Bullet: `EvalRunner.run(toolCallAccuracyEval, trace)` returns a typed `EvalResult`.

### FB-04 `feat/fb-04-eval-framework`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(evals): EvalRunner accepts eval definitions and returns results` | `src/evals/EvalRunner.test.ts` | Failing |
| `feat(evals): EvalRunner + EvalResult types` | `src/evals/EvalRunner.ts`, `src/evals/types.ts` | Passing |
| `test(evals): ToolCallAccuracyEval detects ghost params` | `src/evals/deterministic/ToolCallAccuracy.test.ts` | Failing |
| `feat(evals): ToolCallAccuracyEval` | `src/evals/deterministic/ToolCallAccuracy.ts` | Passing |
| `test(evals): ArchitecturalAdherenceEval validates ADR rules` | `src/evals/deterministic/ArchitecturalAdherence.test.ts` | Failing |
| `feat(evals): ArchitecturalAdherenceEval` | `src/evals/deterministic/ArchitecturalAdherence.ts` | Passing |

### FB-05 `feat/fb-05-golden-trace-regression`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(evals): GoldenTraceEval compares trace against fixture` | `src/evals/regression/GoldenTraceEval.test.ts` | Failing |
| `feat(evals): GoldenTraceEval — structural diff of span sequence` | `src/evals/regression/GoldenTraceEval.ts` | Passing |
| `chore(evals): add example golden fixture` | `tests/fixtures/golden/example-trace.json` | Sample data |
| `test(evals): LLMJudgeEval interface + mock judge` | `src/evals/llm-judge/LLMJudgeEval.test.ts` | Failing (mock) |
| `feat(evals): LLMJudgeEval with configurable judge function` | `src/evals/llm-judge/LLMJudgeEval.ts` | Passing |

**Done when:** `vitest run` passes all deterministic evals; `EVAL=true vitest run` additionally runs LLM-judge evals with a mock judge.

---

## Phase 5 — Incident Response (PR-05)

**Goal:** Repeating trace patterns are detected, MOD-04 receives an interrupt signal, and a post-mortem is written to disk.
Tracer Bullet: inject a 3x repeating span sequence → detector fires → post-mortem `.md` appears in `/post-mortems/`.

### FB-06 `feat/fb-06-incident-response`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(incident): LoopDetector identifies repeating span patterns` | `src/incident/LoopDetector.test.ts` | Failing |
| `feat(incident): LoopDetector — sliding window hash comparison` | `src/incident/LoopDetector.ts` | Passing |
| `test(incident): InterruptEmitter fires on detection` | `src/incident/InterruptEmitter.test.ts` | Failing |
| `feat(incident): InterruptEmitter — EventEmitter-based, async-safe` | `src/incident/InterruptEmitter.ts` | Passing |
| `test(incident): PostMortemGenerator writes markdown report` | `src/incident/PostMortemGenerator.test.ts` | Failing |
| `feat(incident): PostMortemGenerator — markdown with trace replay` | `src/incident/PostMortemGenerator.ts` | Passing |
| `refactor(incident): wire LoopDetector into SpanLifecycle.endSpan()` | `src/core/SpanLifecycle.ts` | Integration |

**Done when:** E2E test confirms repeating-span trace produces a post-mortem file with correct trace ID, detected pattern, and timestamp.

---

## Phase 6 — External Adapters (PR-06)

**Goal:** Export to Langfuse/Phoenix (HTTP) and expose Prometheus metrics.
Tracer Bullet: single trace POSTed to a mock Langfuse server receives correct OTEL payload.

### FB-07 `feat/fb-07-external-adapters`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(adapters): LangfuseAdapter sends correct OTEL payload` | `src/adapters/langfuse/LangfuseAdapter.test.ts` | Failing (mock server) |
| `feat(adapters): LangfuseAdapter` | `src/adapters/langfuse/LangfuseAdapter.ts` | Passing |
| `test(adapters): PrometheusAdapter exposes token + cost metrics` | `src/adapters/prometheus/PrometheusAdapter.test.ts` | Failing |
| `feat(adapters): PrometheusAdapter — counter + gauge metrics` | `src/adapters/prometheus/PrometheusAdapter.ts` | Passing |
| `docs(adapters): adapter configuration guide` | `docs/adapters.md` | Usage examples |

**Done when:** `LangfuseAdapter` and `PrometheusAdapter` tests pass with mock transports.

---

## Phase 7 — Grafana Tempo Adapter (PR-07)

**Goal:** Export OTEL traces to Grafana Tempo (local or Grafana Cloud) over OTLP/HTTP.
Tracer Bullet: single trace POSTed to a mock Tempo OTLP endpoint receives correct OTEL payload + Basic auth header.

### FB-08 `feat/fb-08-tempo-adapter`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(adapters): TempoAdapter OTLP/HTTP trace export — failing tests` | `src/adapters/tempo/TempoAdapter.test.ts` | Failing (mock fetch) |
| `feat(adapters): TempoAdapter — OTLP/HTTP export to Grafana Tempo` | `src/adapters/tempo/TempoAdapter.ts` | Passing |
| `chore(adapters): wire TempoAdapter into public API` | `src/index.ts` | Exports |
| `docs(adapters): add TempoAdapter to adapter guide` | `docs/adapters.md` | Usage examples |

**Done when:** `TempoAdapter` tests pass with mock fetch; both Grafana Cloud (Basic auth) and unauthenticated local Tempo patterns covered.

---

## Phase 8 — HITL Webhook Delivery (PR-08)

**Goal:** CircuitBreaker and LoopDetector signals can be delivered to external systems
(Slack, PagerDuty, custom handlers) over HTTP without coupling to any specific platform.
Tracer Bullet: CircuitBreaker `limit-reached` event wired to `WebhookNotifier.send()` delivers
correct JSON payload to a mock endpoint.

### FB-09 `feat/fb-09-hitl-webhook`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(notify): WebhookNotifier HTTP delivery + event integration — failing tests` | `src/notify/WebhookNotifier.test.ts` | Failing (mock fetch) |
| `feat(notify): WebhookNotifier — JSON POST delivery for HITL signals` | `src/notify/WebhookNotifier.ts` | Passing |
| `chore(notify): wire WebhookNotifier into public API` | `src/index.ts` | Exports |

**Done when:** `WebhookNotifier` tests pass with mock fetch; CircuitBreaker and LoopDetector
integration patterns verified end-to-end without arbitrary timeouts.

---

## Phase 9 — Web UI for Trace Visualisation (PR-09)

**Goal:** Lightweight local HTTP server (Node built-ins only) serving a single-page
trace viewer — trace list, span table, token/model columns.
Tracer Bullet: `TraceServer.start()` binds, `GET /api/traces` returns summaries,
`GET /api/traces/:id` returns full trace, `GET /` returns self-contained HTML.

### FB-10 `feat/fb-10-trace-server-ui`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(ui): TraceServer HTTP routes and HTML page — failing tests` | `src/ui/TraceServer.test.ts` | Failing (real HTTP, port 0) |
| `feat(ui): TraceServer — local HTTP trace viewer` | `src/ui/TraceServer.ts` | Passing |
| `chore(ui): wire TraceServer into public API` | `src/index.ts` | Exports |

**Done when:** All routes tested with real HTTP (no mocking); `port: 0` ensures no port
conflicts in CI; `stop()` verified to close the server cleanly.

---

## PR Summary

| PR    | Feature Branches | Scope                                    |
|-------|-----------------|------------------------------------------|
| PR-00 | FB-00           | Project scaffold + CI                    |
| PR-01 | FB-01           | Core tracing data model + OTEL serialiser|
| PR-02 | FB-02           | Token counting + cost calc + circuit breaker |
| PR-03 | FB-03           | OTEL export interface + SQLite adapter   |
| PR-04 | FB-04 + FB-05   | Eval framework (deterministic + LLM-judge + golden trace) |
| PR-05 | FB-06           | Incident response (loop detect + interrupt + post-mortem) |
| PR-06 | FB-07           | External adapters (Langfuse, Prometheus) |
| PR-07 | FB-08           | Grafana Tempo adapter (OTLP/HTTP)        |
| PR-08 | FB-09           | HITL webhook delivery                    |
| PR-09 | FB-10           | Web UI for trace visualisation           |
| PR-10 | FB-11           | Grafana dashboard JSON generator         |

---

## Phase 10 — Grafana Dashboard JSON Generator (PR-10)

**Goal:** Pure function `generateGrafanaDashboard()` returns a ready-to-import Grafana
dashboard JSON with panels for the three PrometheusAdapter metric families.
Tracer Bullet: calling `generateGrafanaDashboard()` returns an object with `panels`,
every panel's targets reference a `franken_observer_*` metric, and the output is
valid JSON (roundtrips through `JSON.parse(JSON.stringify(...))`).

### FB-11 `feat/fb-11-grafana-dashboard`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(grafana): generateGrafanaDashboard structure and metric coverage — failing tests` | `src/grafana/GrafanaDashboard.test.ts` | Failing |
| `feat(grafana): generateGrafanaDashboard — 6-panel Prometheus dashboard` | `src/grafana/GrafanaDashboard.ts` | Passing |
| `chore(grafana): wire generateGrafanaDashboard into public API` | `src/index.ts` | Exports |

**Done when:** All panels present, metric names covered, datasource variable wired,
custom title/uid/tags/datasourceUid options work, output is JSON-serialisable.

---

## Definition of Done (per PR)

- [ ] All `*.test.ts` pass: `vitest run`
- [ ] No TypeScript errors: `tsc --noEmit`
- [ ] No regressions on previously-merged tests
- [ ] Tracer bullet path documented in PR description
- [ ] Public API surface added to `src/index.ts`

---

## Phase 11 — Webhook Retry with Exponential Backoff (PR-11)

**Goal:** `WebhookNotifier` retries transient delivery failures with configurable
exponential backoff and jitter. Backwards-compatible — existing callers without a
`retry` option are unaffected.
Tracer Bullet: `send()` with `maxRetries: 2` invokes fetch 3 times total when the
first two attempts return 503, then succeeds on the third.

### FB-12 `feat/fb-12-webhook-retry`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(notify): WebhookNotifier retry with exponential backoff — failing tests` | `src/notify/WebhookNotifier.test.ts` | Failing (extend existing test file) |
| `feat(notify): WebhookNotifier retry — exponential backoff + jitter` | `src/notify/WebhookNotifier.ts` | Passing |

**Done when:** Retry count, delay doubling, `maxDelayMs` cap, jitter, and backwards
compatibility all verified. Injectable `sleep` keeps tests instant — no real timers.

---

## PR Summary

| PR    | Feature Branches | Scope                                    |
|-------|-----------------|------------------------------------------|
| PR-00 | FB-00           | Project scaffold + CI                    |
| PR-01 | FB-01           | Core tracing data model + OTEL serialiser|
| PR-02 | FB-02           | Token counting + cost calc + circuit breaker |
| PR-03 | FB-03           | OTEL export interface + SQLite adapter   |
| PR-04 | FB-04 + FB-05   | Eval framework (deterministic + LLM-judge + golden trace) |
| PR-05 | FB-06           | Incident response (loop detect + interrupt + post-mortem) |
| PR-06 | FB-07           | External adapters (Langfuse, Prometheus) |
| PR-07 | FB-08           | Grafana Tempo adapter (OTLP/HTTP)        |
| PR-08 | FB-09           | HITL webhook delivery                    |
| PR-09 | FB-10           | Web UI for trace visualisation           |
| PR-10 | FB-11           | Grafana dashboard JSON generator         |
| PR-11 | FB-12           | Webhook retry with exponential backoff   |
| PR-12 | FB-13           | Multi-adapter fan-out                    |
| PR-13 | FB-14           | Trace sampling                           |
| PR-14 | FB-15           | W3C Trace Context propagation            |
| PR-15 | FB-16           | Span redaction middleware                |
| PR-16 | FB-17           | Batched export adapter                   |

---

## Phase 16 — Batched Export Adapter (PR-16)

**Goal:** `BatchAdapter` buffers `flush()` calls and forwards them to the inner
adapter in bulk, reducing HTTP round-trips for high-throughput agent workloads.
Tracer Bullet: with `maxBatchSize: 3`, two `flush()` calls leave the inner adapter
empty; the third triggers a drain and all three traces appear in the inner adapter.

### FB-17 `feat/fb-17-batch-adapter`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(adapters): BatchAdapter buffering, drain, stop, query — failing tests` | `src/adapters/batch/BatchAdapter.test.ts` | Failing |
| `feat(adapters): BatchAdapter — size-triggered + timer-triggered bulk drain` | `src/adapters/batch/BatchAdapter.ts` | Passing |
| `chore(adapters): wire BatchAdapter into public API` | `src/index.ts` | Exports |

**Done when:** Size trigger, manual drain(), stop() with timer cancellation, buffer-aware
queryByTraceId and listTraceIds all verified. Injectable setInterval/clearInterval keeps
timer tests deterministic. 373 tests, 0 TS errors.

---

## Phase 15 — Span Redaction Middleware (PR-15)

**Goal:** `SpanRedactor` wraps any `ExportAdapter` and strips or masks sensitive
span metadata fields (PII, secrets, tool outputs) before the trace reaches
downstream backends. The original trace is never mutated.
Tracer Bullet: `SpanRedactor` with `{ key: /^api_/, action: 'remove' }` drops all
`api_*` metadata keys from every span; the underlying adapter receives the
scrubbed copy while the caller's trace object is unchanged.

### FB-16 `feat/fb-16-span-redactor`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(redaction): SpanRedactor metadata rules, thoughtBlocks, immutability — failing tests` | `src/redaction/SpanRedactor.test.ts` | Failing |
| `feat(redaction): SpanRedactor — remove/mask rules + thoughtBlocks wipe` | `src/redaction/SpanRedactor.ts` | Passing |
| `chore(redaction): wire SpanRedactor into public API` | `src/index.ts` | Exports |

**Done when:** Exact-string and RegExp key rules verified; `maskWith` customisation;
immutability confirmed; `redactThoughtBlocks` clears all thought blocks;
delegation to underlying adapter unchanged. 353 tests, 0 TS errors.

---

## Phase 14 — W3C Trace Context Propagation (PR-14)

**Goal:** Pure utility functions for parsing and formatting W3C `traceparent` and
`tracestate` headers, plus HTTP helper functions for extracting and injecting
context across service boundaries.
Tracer Bullet: `parseTraceparent(header)` returns correct `traceId`/`parentSpanId`/`sampled`
fields; `formatTraceparent(fields)` roundtrips cleanly; `extractFromHeaders` / `injectIntoHeaders`
bridge the spec to real HTTP request objects.

### FB-15 `feat/fb-15-trace-context-propagation`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(propagation): W3C traceparent + tracestate parse/format — failing tests` | `src/propagation/W3CTraceContext.test.ts` | Failing |
| `feat(propagation): W3CTraceContext — parse, format, extract, inject` | `src/propagation/W3CTraceContext.ts` | Passing |
| `chore(propagation): wire W3CTraceContext into public API` | `src/index.ts` | Exports |

**Done when:** All edge cases covered (null IDs, all-zeros rejection, future version byte
acceptance, case-insensitive header extraction, tracestate roundtrip). 337 tests, 0 TS errors.

---

## Phase 13 — Trace Sampling (PR-13)

**Goal:** Pluggable `SamplerStrategy` interface with three built-in strategies and a
`SamplingAdapter` that gates `flush()` behind sampling decisions.
Tracer Bullet: `SamplingAdapter` with `ProbabilisticSampler(0)` drops all traces;
`RateLimitedSampler({ maxPerWindow: 2, windowMs: 1000 })` passes only the first
two flush() calls per window.

### FB-14 `feat/fb-14-trace-sampling`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(sampling): AlwaysOnSampler, ProbabilisticSampler, RateLimitedSampler, SamplingAdapter — failing tests` | `src/sampling/TraceSampler.test.ts` | Failing |
| `feat(sampling): trace sampling strategies + SamplingAdapter` | `src/sampling/TraceSampler.ts` | Passing |
| `chore(sampling): wire sampling into public API` | `src/index.ts` | Exports |

**Done when:** All three strategies' edge cases verified; `SamplingAdapter` confirmed to
gate flush() correctly; injectable RNG and clock keep tests deterministic. 293 tests, 0 TS errors.

---

## Phase 12 — Multi-Adapter Fan-out (PR-12)

**Goal:** `MultiAdapter` wraps N `ExportAdapter`s and broadcasts every `flush()` call
to all of them in parallel, enabling simultaneous write to SQLite, Langfuse, and
Prometheus from a single call site.
Tracer Bullet: `flush()` with two `InMemoryAdapter`s stores the same trace in both;
one failing adapter does not prevent the other from receiving the trace.

### FB-13 `feat/fb-13-multi-adapter`

| Commit | File(s) | Description |
|--------|---------|-------------|
| `test(adapters): MultiAdapter fan-out — failing tests` | `src/adapters/multi/MultiAdapter.test.ts` | Failing |
| `feat(adapters): MultiAdapter — parallel flush + first-wins query + union list` | `src/adapters/multi/MultiAdapter.ts` | Passing |
| `chore(adapters): wire MultiAdapter into public API` | `src/index.ts` | Exports |

**Done when:** flush() allSettled semantics verified (all adapters called even on partial
failure); `throwOnError: false` best-effort mode; `queryByTraceId` first-wins; `listTraceIds`
deduplicated union. 274 tests, 0 TS errors.

---

## Definition of Done (per PR)

- [ ] All `*.test.ts` pass: `vitest run`
- [ ] No TypeScript errors: `tsc --noEmit`
- [ ] No regressions on previously-merged tests
- [ ] Tracer bullet path documented in PR description
- [ ] Public API surface added to `src/index.ts`
