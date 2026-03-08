# ADR-0003 — Four-Method Adapter Contract as Provider Boundary

**Status**: Accepted

## Context

The pipeline must call any LLM provider without knowing which one it is. We need a boundary that isolates all provider-specific knowledge inside adapter files and prevents leakage into the guardrail chain.

## Decision

Every provider adapter implements exactly four methods:

1. `transformRequest` — maps UnifiedRequest → provider shape
2. `execute` — transport (HTTP/gRPC), retries, timeouts
3. `transformResponse` — maps provider response → UnifiedResponse
4. `validateCapabilities` — self-reports feature support

The pipeline calls only `IAdapter`. It never imports a concrete adapter directly. Adapters are injected via `AdapterRegistry`.

Provider-specific code (header formats, auth tokens, model-specific quirks, rate limit handling) is allowed only inside an adapter file. If it appears elsewhere, it is a bug.

## Consequences

- New providers are added by creating a new file and registering it — zero changes to pipeline or interceptors
- `validateCapabilities` must be called inside `transformRequest` before mapping, not by the caller
- `execute` must delegate retry/timeout logic to `BaseAdapter` to avoid duplication
- If a provider changes their API, only one adapter file changes
