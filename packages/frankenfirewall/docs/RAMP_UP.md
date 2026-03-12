# Frankenfirewall (MOD-01) -- Agent Ramp-Up

Model-agnostic proxy that enforces guardrail policies between the orchestrator and LLM providers. Every request/response flows through a bidirectional interceptor pipeline; the orchestrator only ever sees `UnifiedResponse`.

## Directory Structure

```
src/
  index.ts                  # re-exports everything below
  types/                    # UnifiedRequest, UnifiedResponse, GuardrailViolation
  config/                   # GuardrailsConfig type + loadConfig() from JSON
  adapters/                 # IAdapter interface, BaseAdapter, AdapterRegistry
    claude/ openai/ ollama/ gemini/ mistral/   # provider adapters
    conformance/            # adapter conformance test harness
  interceptors/
    inbound/                # InjectionScanner, PiiMasker, ProjectAlignmentChecker
    outbound/               # SchemaEnforcer, DeterministicGrounder, HallucinationScraper
    skill-registry-client.ts
  pipeline/                 # runPipeline() -- wires interceptors + adapter
  observability/            # AuditLogger, CostLedger
  server/                   # Hono HTTP app (createFirewallApp)
```

## Public API

| Export | Signature | Notes |
|--------|-----------|-------|
| `runPipeline` | `(req, adapter, config, opts?) => Promise<PipelineResult>` | Main entry point |
| `createFirewallApp` | `(opts: FirewallAppOptions) => Hono` | HTTP server factory |
| `loadConfig` | `(filePath: string) => GuardrailsConfig` | Throws `ConfigError` on invalid JSON |
| `scanForInjection` | `(req, securityTier?) => InterceptorResult` | Default tier: `"STRICT"` |
| `maskPii` | `(req, redactPii: boolean) => InterceptorResult<UnifiedRequest>` | Returns masked copy |
| `checkProjectAlignment` | `(req, config, skillRegistry?) => InterceptorResult` | Budget + provider + tool checks |
| `enforceSchema` | `(raw: unknown, version?) => InterceptorResult<UnifiedResponse>` | Validates shape |
| `groundToolCalls` | `(resp, skillRegistry?) => InterceptorResult<UnifiedResponse>` | Validates tool names + args |
| `scrapeHallucinations` | `(resp, whitelist: string[]) => InterceptorResult<UnifiedResponse>` | Flags unknown imports |
| `AdapterRegistry` | `new (allowedProviders: Provider[])` | `.register(provider, adapter)` / `.getAdapter(provider)` |
| `AuditLogger` | `new (opts?)` | `.log(entry)` / `.buildEntry(params)` |
| `CostLedger` | `new ()` | `.record(sessionId, cost)` / `.wouldExceed(id, add, ceiling)` |
| `runAdapterConformance` | `(factory, request, fixtures) => ConformanceResult` | Test harness for adapters |

## Key Types

```typescript
interface UnifiedRequest {
  id: string; provider: string; model: string;
  system?: string; messages: Message[]; tools?: ToolDefinition[];
  max_tokens?: number; session_id?: string;
}

interface UnifiedResponse {
  schema_version: 1; id: string; model_used: string;
  content: string | null; tool_calls: ToolCall[];
  finish_reason: "stop" | "tool_use" | "length" | "content_filter";
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
}

type InterceptorResult<T = void> =
  | { passed: true; value?: T }
  | { passed: false; violations: GuardrailViolation[] };

interface IAdapter {
  transformRequest(req: UnifiedRequest): unknown;
  execute(providerReq: unknown): Promise<unknown>;
  transformResponse(providerResp: unknown, requestId: string): UnifiedResponse;
  validateCapabilities(feature: CapabilityFeature): boolean;
}

type ViolationCode = "INJECTION_DETECTED" | "PII_DETECTED" | "BUDGET_EXCEEDED"
  | "PROVIDER_NOT_ALLOWED" | "SCHEMA_MISMATCH" | "TOOL_NOT_GROUNDED"
  | "HALLUCINATION_DETECTED" | "ADAPTER_ERROR" | "CONFIG_ERROR";

type Provider = "anthropic" | "openai" | "local-ollama";
type SecurityTier = "STRICT" | "MODERATE" | "PERMISSIVE";
```

## Gotchas

- **InterceptorResult.value is optional even when passed=true.** Always null-check: `result.passed && result.value`.
- **maskPii always returns `pass()`.** It never blocks; it returns the masked request in `value`.
- **scrapeHallucinations skips if whitelist is empty** (length 0 = no-op, not "block everything").
- **groundToolCalls skips if no skillRegistry** is provided (no registry = no grounding, not a failure).
- **schema_version is literal `1`** (not a number range). Config and response must both be `1`.
- **BaseAdapter.makeViolation** sets `interceptor: "Pipeline"` and `code: "ADAPTER_ERROR"` -- all adapter errors look the same from outside.
- **Blocked responses** use `finish_reason: "content_filter"`, `model_used: "guardrail"`, zero usage.
- **Pipeline short-circuits**: injection or alignment failure skips the adapter call entirely.
- **loadConfig** uses synchronous `readFileSync`; do not call in hot paths.
- **Provider type is a union of 3 strings.** Adding a provider requires updating the `Provider` type in config.

## IAdapter Contract

Adapters extend `BaseAdapter` and implement `IAdapter`. BaseAdapter provides:
- `withRetry(fn)` -- exponential backoff (default: 3 attempts, 500ms, 2x multiplier)
- `withTimeout(fn)` -- rejects after `timeoutMs` (default: 30s)
- `calculateCost(inputTokens, outputTokens)` -- uses per-M token pricing

Pattern: `execute()` calls `this.withRetry(() => this.withTimeout(async () => { ... }))`.

## Interceptor Pipeline Order

```
INBOUND (pre-flight, can block before adapter call):
  1. InjectionScanner   -- regex-based prompt injection detection
  2. PiiMasker          -- replaces email/CC/SSN/phone with [REDACTED] tokens
  3. ProjectAlignment   -- provider allowlist, budget ceiling, tool scope

ADAPTER CALL: transformRequest -> execute -> transformResponse

OUTBOUND (post-flight, validates LLM output):
  4. SchemaEnforcer     -- validates UnifiedResponse shape
  5. DeterministicGrounder -- tool calls exist in SkillRegistry
  6. HallucinationScraper  -- imports match dependency whitelist
```

## HTTP Server

Built on Hono. Created via `createFirewallApp({ config, adapters, defaultProvider? })`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Returns `{ status, providers[], timestamp }` |
| `/v1/chat/completions` | POST | OpenAI-compatible proxy. Provider from body or default. |
| `/v1/messages` | POST | Anthropic Messages API proxy. Always uses `"anthropic"`. |

Blocked requests return **422** with `{ error: { type: "guardrail_violation", violations[] } }`.
Middleware: `x-request-id` header injection + global error handler (500 JSON).

## Build and Test

```bash
npm run build          # tsc
npm test               # vitest run
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest --coverage
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
```

Only runtime dependency: `hono`. Dev: vitest, typescript, eslint, prettier.

## System Context

MOD-01 in the Frankenbeast monorepo. Sits between `franken-orchestrator` (caller) and LLM providers. Depends on `SkillRegistryClient` interface (MOD-02 boundary) for tool grounding -- injected, never imported concretely. Config is `guardrails.config.json` per project.
