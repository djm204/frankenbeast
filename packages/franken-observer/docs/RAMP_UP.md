# @frankenbeast/observer Ramp-Up

**Status**: **INTEGRATED (Active)** — This is the primary observability and evaluation module for the Frankenbeast framework. It is actively used by the `franken-orchestrator` to track spans, calculate costs, and monitor for loops.

## Module Overview
The module provides a comprehensive observability suite, including distributed tracing (OTEL-compatible), token spend circuit breakers, and deterministic/LLM-powered evaluations of agent output.

## Current Functionality
- **Distributed Tracing**: Records spans for every LLM call and internal process.
- **Cost Calculation**: Real-time USD tracking for Claude, GPT-4o, and Codex models.
- **Circuit Breakers**: Halts or alerts when token budget is exceeded or when infinite loops are detected.
- **Evaluation System**: Runs `ToolCallAccuracy` and `LLMJudge` evals against recorded traces.
- **Storage Adapters**: Supports SQLite, Prometheus, and Langfuse for trace persistence.

## Key Integration
The `franken-orchestrator` interacts with this package via the `CliObserverBridge`. Every turn in the `MartinLoop` generates a span that is recorded in the local SQLite database (`.fbeast/.build/observer.db`).

## Key API

### Trace Management
```typescript
const trace = TraceContext.createTrace('goal');
const span = TraceContext.startSpan(trace, { name: 'task' });
TraceContext.endSpan(span, { status: 'completed' });
```

### Cost Tracking
```typescript
const calculator = new CostCalculator(DEFAULT_PRICING);
const usd = calculator.calculate(tokenUsage);
```

## Build & Test
```bash
npm run build          # tsc
npm run test           # vitest run
npm run test:integration # requires SQLite
```

## Dependencies
- `better-sqlite3`: For local trace storage.
- `@franken/types`: For shared token and ID definitions.
