# franken-observer (MOD-05) -- Agent Ramp-Up

Observability, cost tracking, and evaluation module for the Frankenbeast agent system. It records every trace/span, monitors token spend with circuit breakers, detects agent loops, and runs deterministic + LLM-judge evals against recorded traces.

## Directory Structure

```
src/
  core/           TraceContext, SpanLifecycle, Trace/Span types
  cost/           TokenCounter, CostCalculator, CircuitBreaker, ModelAttribution, DEFAULT_PRICING
  evals/          EvalRunner + types, deterministic/, regression/, llm-judge/
  export/         ExportAdapter interface, InMemoryAdapter, OTELSerializer
  adapters/       sqlite/, langfuse/, prometheus/, tempo/, multi/, batch/
  incident/       LoopDetector, InterruptEmitter, PostMortemGenerator
  sampling/       AlwaysOnSampler, ProbabilisticSampler, RateLimitedSampler, SamplingAdapter
  redaction/      SpanRedactor (scrubs metadata/thoughtBlocks before export)
  propagation/    W3C Trace Context parse/format/extract/inject utilities
  notify/         WebhookNotifier
  ui/             TraceServer
  grafana/        generateGrafanaDashboard
  index.ts        Public API (85+ exports)
```

## Public API (grouped)

| Group | Key Exports |
|-------|------------|
| **Core** | `TraceContext`, `SpanLifecycle` |
| **Types** | `Trace`, `Span`, `SpanStatus`, `TraceStatus`, `StartSpanOptions`, `EndSpanOptions`, `TokenUsage` |
| **Cost** | `TokenCounter`, `CostCalculator`, `CircuitBreaker`, `ModelAttribution`, `DEFAULT_PRICING` |
| **Export** | `ExportAdapter` (interface), `InMemoryAdapter`, `OTELSerializer` |
| **Adapters** | `SQLiteAdapter`, `LangfuseAdapter`, `PrometheusAdapter`, `TempoAdapter`, `MultiAdapter`, `BatchAdapter` |
| **Sampling** | `SamplingAdapter`, `AlwaysOnSampler`, `ProbabilisticSampler`, `RateLimitedSampler` |
| **Redaction** | `SpanRedactor` |
| **Propagation** | `parseTraceparent`, `formatTraceparent`, `parseTracestate`, `formatTracestate`, `extractFromHeaders`, `injectIntoHeaders` |
| **Evals** | `EvalRunner`, `ToolCallAccuracyEval`, `ArchitecturalAdherenceEval`, `GoldenTraceEval`, `LLMJudgeEval` |
| **Incident** | `LoopDetector`, `InterruptEmitter`, `PostMortemGenerator` |
| **Infra** | `WebhookNotifier`, `TraceServer`, `generateGrafanaDashboard` |

## Key Types

- **`Trace`** -- `{ id, goal, status, startedAt, endedAt?, spans: Span[] }`
- **`Span`** -- `{ id, traceId, parentSpanId?, name, status, startedAt, endedAt?, durationMs?, errorMessage?, metadata: Record<string,unknown>, thoughtBlocks: string[] }`
- **`TokenUsage`** -- `{ promptTokens, completionTokens, model? }`
- **`CircuitBreakerResult`** -- `{ tripped: boolean, limitUsd, spendUsd }`
- **`ExportAdapter`** -- interface: `flush(trace)`, `queryByTraceId(id)`, `listTraceIds()`
- **`Eval<TInput>`** -- interface: `name: string`, `run(input: TInput): EvalResult | Promise<EvalResult>`
- **`EvalResult`** -- `{ evalName, status: 'pass'|'fail'|'skip', score?, reason?, details? }`

## TraceContext and SpanLifecycle

`TraceContext` is a plain object (not a class) with four methods:

```ts
const trace = TraceContext.createTrace('user goal')
const span  = TraceContext.startSpan(trace, { name: 'step-1' })
TraceContext.endSpan(span, { status: 'completed' }, loopDetector?)
TraceContext.endTrace(trace)
```

`SpanLifecycle` enriches active spans:

```ts
SpanLifecycle.setMetadata(span, { key: 'value' })
SpanLifecycle.addThoughtBlock(span, 'reasoning text')
SpanLifecycle.recordTokenUsage(span, { promptTokens: 100, completionTokens: 50, model: 'claude-sonnet-4-6' }, counter?)
```

Both throw if the span/trace is not `'active'`.

## Cost Tracking

- **`TokenCounter`** -- accumulates per-model token counts. `.record(entry)`, `.totalsFor(model)`, `.grandTotal()`, `.allModels()`, `.reset()`
- **`CostCalculator`** -- `new CostCalculator(pricingTable)`. `.calculate(tokenRecord)` returns USD. `.totalCost(entries[])`.
- **`CircuitBreaker`** -- `new CircuitBreaker({ limitUsd })`. `.check(spendUsd)` returns `CircuitBreakerResult`. Non-blocking; fires `'limit-reached'` event handlers when tripped. `.on('limit-reached', handler)` / `.off(...)`.
- **`ModelAttribution`** -- `new ModelAttribution(pricingTable)`. `.record({ model, promptTokens, completionTokens, success })`. `.report()` returns `AttributionRow[]` with success rates and costs.
- **`DEFAULT_PRICING`** -- built-in `PricingTable` with Claude (opus/sonnet/haiku), GPT-4o, GPT-4o-mini, Codex. Pricing is per-million tokens.

## Circuit Breaker + Incident System

`CircuitBreaker.check()` is synchronous and event-driven (never throws). Wire it with `LoopDetector` and `InterruptEmitter`:

- **`LoopDetector`** -- sliding-window pattern detector on span names. `new LoopDetector({ windowSize?: 3, repeatThreshold?: 3 })`. `.check(spanName)` returns `LoopDetectionResult`. Fires `'loop-detected'` events.
- **`InterruptEmitter`** -- async-safe signal bus. `.emit(signal)`, `.on('interrupt', handler)`. Handler errors are isolated.
- **`PostMortemGenerator`** -- generates markdown reports. `.generateContent(trace, signal)` is pure; `.generate(trace, signal)` writes to disk.

## Eval System

`EvalRunner` wraps any `Eval<T>` with error handling:

```ts
const runner = new EvalRunner()
const result = await runner.run(new ToolCallAccuracyEval(), { actual, schema })
const results = await runner.runAll(evals, input)
```

Four built-in evals:

| Eval | Type | Input | Checks |
|------|------|-------|--------|
| `ToolCallAccuracyEval` | deterministic | `{ actual: {tool, params}, schema: {tool, required, allowed} }` | Tool name match, required params present, no ghost params |
| `ArchitecturalAdherenceEval` | deterministic | `{ output: string, rules: ADRRule[] }` | Each rule's `.check(output)` returns true |
| `GoldenTraceEval` | regression | `{ actual: Trace, golden: GoldenTrace }` | Span name set matches golden fixture |
| `LLMJudgeEval` | LLM-judge | generic `TInput` | `buildPrompt(input)` -> `judge(prompt)` -> score vs threshold (default 0.7) |

## Adapters

All implement `ExportAdapter`. Write-only adapters return `null`/`[]` for queries.

| Adapter | Backend | Notes |
|---------|---------|-------|
| `InMemoryAdapter` | in-process Map | Tests and prototyping |
| `SQLiteAdapter` | `better-sqlite3` | Constructor takes DB path. Call `.close()` when done |
| `LangfuseAdapter` | HTTP POST | `{ publicKey, secretKey, baseUrl?, fetch? }` |
| `PrometheusAdapter` | in-process counters | `.scrape()` returns Prometheus text format, `.reset()` |
| `TempoAdapter` | OTLP/HTTP POST | `{ endpoint, otlpPath?, basicAuth?, fetch? }` |
| `MultiAdapter` | fan-out | Broadcasts flush to N adapters. `throwOnError` (default true) uses AggregateError |
| `BatchAdapter` | buffering | Wraps one adapter. Drains on size/timer/manual/stop. Call `.stop()` on shutdown |
| `SamplingAdapter` | gate | Wraps one adapter + `SamplerStrategy`. Dropped traces are silent |
| `SpanRedactor` | privacy filter | Wraps one adapter. Rules: `remove` or `mask` metadata keys. `redactThoughtBlocks` option |

## API Gotchas

1. `TraceContext` and `SpanLifecycle` are **plain objects**, not classes. Do not `new` them.
2. `CircuitBreaker.check()` takes **current total spend**, not a delta. You must track cumulative spend yourself.
3. Write-only adapters (`Langfuse`, `Prometheus`, `Tempo`) return `null`/`[]` for read operations -- they do not throw.
4. `SpanRedactor` never mutates the original trace; it deep-copies before redacting.
5. `BatchAdapter.stop()` is async and must be awaited on shutdown to avoid losing buffered traces.
6. `LoopDetector.check()` must be called per span name (often via `TraceContext.endSpan`'s third arg).
7. `LLMJudgeEval` default pass threshold is `0.7`. Override via `passThreshold` in options.
8. `OTELSerializer` is used internally by Langfuse/Tempo adapters; you rarely call it directly.

## Build and Test

```bash
npm run build          # tsup -> dist/ (dual CJS + ESM)
npm run typecheck      # tsc --noEmit
npm run test           # vitest run (~389 tests)
npm run test:watch     # vitest (watch mode)
npm run test:integration  # INTEGRATION=true vitest run (requires SQLite)
npm run test:eval         # EVAL=true vitest run (LLM-judge evals, costs money)
```

Tests are co-located (`*.test.ts` next to source). Integration tests use `*.integration.test.ts`.

## Dependencies

- **Runtime:** `better-sqlite3` (SQLite adapter)
- **Dev:** `vitest`, `tsup`, `typescript`, `@types/better-sqlite3`, `@types/node`
- **No OTEL SDK dependency** -- the module serializes to OTEL format via its own `OTELSerializer`
