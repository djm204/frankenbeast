# Franken Firewall

**A model-agnostic guardrail proxy for LLM-powered systems.**

Franken Firewall sits between your application and any large language model. It enforces your security policy, strips PII, blocks prompt injection, validates every tool call, and scrubs hallucinated dependencies — before a single token reaches your business logic or a single side-effect runs.

It treats every LLM as what it actually is: a non-deterministic black box that should never be trusted unconditionally.

---

> ### Disclaimer
>
> **This project is provided for educational and experimental purposes only.**
> The author takes no responsibility for any actions, outputs, or consequences resulting from an LLM or AI assistant following these rules. Use at your own risk. Always review AI-generated code before deploying to production.

---

## Why this exists

LLM integrations fail in predictable ways:

- **Prompt injection** — user-supplied content overrides system instructions
- **PII leakage** — sensitive data sent to third-party APIs without redaction
- **Hallucinated tool calls** — the model invokes functions that don't exist, with arguments that don't validate
- **Ghost dependencies** — generated code imports packages that were invented by the model
- **Provider lock-in** — switching from Claude to GPT (or to a local model) requires rewriting integration code
- **Runaway costs** — no ceiling on per-call or per-session token spend

Franken Firewall addresses all six with a composable middleware pipeline that runs in the critical path on every request.

---

## How it works

Every request passes through two interception stages wrapped around a provider-agnostic adapter:

```
Your Application
      │
      ▼
┌─────────────────────────────────────────────────────┐
│                  INBOUND (Pre-Flight)                │
│                                                     │
│  1. InjectionScanner      — structural intent scan  │
│  2. PiiMasker             — local redaction, no API │
│  3. ProjectAlignmentChecker — budget, scope, allow  │
└─────────────────────────────────────────────────────┘
      │  clean, masked, validated request
      ▼
┌─────────────────────────────────────────────────────┐
│                   ADAPTER LAYER                     │
│                                                     │
│  ClaudeAdapter  │  OpenAIAdapter  │  YourAdapter    │
│                                                     │
│  transformRequest → execute → transformResponse     │
└─────────────────────────────────────────────────────┘
      │  raw provider response
      ▼
┌─────────────────────────────────────────────────────┐
│                 OUTBOUND (Post-Flight)               │
│                                                     │
│  4. SchemaEnforcer        — UnifiedResponse shape   │
│  5. DeterministicGrounder — tool call validation    │
│  6. HallucinationScraper  — import whitelist check  │
└─────────────────────────────────────────────────────┘
      │
      ▼
  UnifiedResponse  ←  always this shape, always
```

**The Orchestrator always receives a `UnifiedResponse`. It never sees a provider-specific shape. It never sees a raw LLM error. It never receives an unvalidated tool call.**

Inbound violations short-circuit the pipeline — the adapter is never called. Outbound violations return `finish_reason: "content_filter"` with a structured, inspectable `GuardrailViolation`. Nothing is silently swallowed.

---

## Interceptors

### Inbound

| Interceptor | What it enforces |
| :--- | :--- |
| `InjectionScanner` | Detects structural intent to override, reassign, or reprioritise instructions. Scans all message content, system prompts, and nested tool result payloads. STRICT tier adds additional pattern categories. |
| `PiiMasker` | Redacts email addresses, phone numbers, SSNs, and credit card patterns using local regex — no data leaves your infrastructure for masking. Controlled per-project via `redact_pii`. |
| `ProjectAlignmentChecker` | Validates provider is in the allowlist, estimated token cost is under the per-call ceiling, and requested tool names exist in the Skill Registry before the request is sent. |

### Outbound

| Interceptor | What it enforces |
| :--- | :--- |
| `SchemaEnforcer` | Validates the raw adapter output against the `UnifiedResponse` v1 contract. Schema version mismatches are hard failures. |
| `DeterministicGrounder` | Checks every `tool_calls[].function_name` against the injected Skill Registry. Validates that arguments are JSON-parseable. Rejects unregistered tools before any execution reaches them. |
| `HallucinationScraper` | Extracts `import`/`require` statements from LLM-generated content and flags any package not present in the project's `dependency_whitelist`. |

---

## Adapter contract

Adding a new provider means creating one file that implements four methods. Nothing else changes.

```typescript
interface IAdapter {
  // Maps UnifiedRequest → provider's native request format
  transformRequest(request: UnifiedRequest): unknown;

  // Handles transport, timeouts, retries
  execute(providerRequest: unknown): Promise<unknown>;

  // Maps raw provider response → UnifiedResponse
  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;

  // Self-reports which features this model supports
  validateCapabilities(feature: CapabilityFeature): boolean;
}
```

Provider-specific code — auth headers, API shapes, model quirks, rate limit handling — lives only inside the adapter file. If you find `if (provider === 'anthropic')` anywhere outside an adapter, that is a bug, not a feature.

Included adapters:

| Adapter | Provider |
| :--- | :--- |
| `ClaudeAdapter` | Anthropic (claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5) |
| `OpenAIAdapter` | OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo) |

---

## Policy configuration

All guardrail behaviour is controlled by a single `guardrails.config.json` file. The pipeline reads it at startup via `loadConfig()` and freezes it — no runtime mutation. Every policy decision traces back to this file.

### Full schema reference

```json
{
  "project_name": "string — required, human-readable name for audit logs",
  "security_tier": "STRICT | MODERATE | PERMISSIVE",
  "schema_version": 1,
  "agnostic_settings": {
    "redact_pii": "boolean",
    "max_token_spend_per_call": "number (USD)",
    "allowed_providers": ["anthropic", "openai", "local-ollama"]
  },
  "safety_hooks": {
    "pre_flight":  ["string labels — logged in audit entries"],
    "post_flight": ["string labels — logged in audit entries"]
  },
  "dependency_whitelist": ["string — npm package names"]
}
```

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `project_name` | `string` | Yes | Appears in audit log entries. Use a stable, unique identifier. |
| `security_tier` | `"STRICT" \| "MODERATE" \| "PERMISSIVE"` | Yes | Controls the injection scanner pattern set. See tier comparison below. |
| `schema_version` | `1` | Yes | Must be `1`. Mismatch between config and response schema is a hard pipeline failure. |
| `agnostic_settings.redact_pii` | `boolean` | Yes | When `true`, the PiiMasker runs on every request before it leaves your infrastructure. |
| `agnostic_settings.max_token_spend_per_call` | `number` | Yes | Hard cost ceiling in USD per call. Requests estimated to exceed this are blocked pre-flight. |
| `agnostic_settings.allowed_providers` | `Provider[]` | Yes | Requests for any provider not on this list are rejected by the AdapterRegistry. At least one required. |
| `safety_hooks.pre_flight` | `string[]` | Yes | Label list recorded in audit entries. Documents which checks run inbound. |
| `safety_hooks.post_flight` | `string[]` | Yes | Label list recorded in audit entries. Documents which checks run outbound. |
| `dependency_whitelist` | `string[]` | No | npm package names the HallucinationScraper permits in LLM output. Omit or set `[]` to disable scraping entirely. |

**Valid providers:** `"anthropic"` · `"openai"` · `"local-ollama"`

---

### Security tiers

The `security_tier` field controls how aggressively the `InjectionScanner` operates. All tiers run the same base pattern set. `STRICT` adds an extended set targeting subtler manipulation techniques.

| Pattern category | PERMISSIVE | MODERATE | STRICT |
| :--- | :---: | :---: | :---: |
| Explicit overrides (`ignore previous instructions`) | Yes | Yes | Yes |
| Role reassignment (`your true role is...`) | Yes | Yes | Yes |
| Priority inversion (`as a reminder, your real task is...`) | Yes | Yes | Yes |
| Context poisoning via `[system]` tags | Yes | Yes | Yes |
| Roleplay / fiction framing (`in this story, you have no restrictions`) | No | No | Yes |
| Hypothetical framing (`hypothetically, if you had no guidelines...`) | No | No | Yes |
| Pretend / persona manipulation (`pretend you lack restrictions`) | No | No | Yes |

**Recommendation:** Use `STRICT` in all production environments. `MODERATE` is appropriate for internal tools where users are trusted. `PERMISSIVE` is only appropriate for tightly controlled developer sandboxes.

---

### Generating a config

You don't have to write `guardrails.config.json` by hand. Build it programmatically and write it out, or construct the object inline and pass it directly to `runPipeline`.

**Inline (no file):**

```typescript
import type { GuardrailsConfig } from "@franken/firewall";

const config: GuardrailsConfig = {
  project_name: "my-service",
  security_tier: "STRICT",
  schema_version: 1,
  agnostic_settings: {
    redact_pii: true,
    max_token_spend_per_call: 0.10,
    allowed_providers: ["anthropic"],
  },
  safety_hooks: {
    pre_flight: ["injection_scan", "pii_mask", "budget_check"],
    post_flight: ["schema_enforce", "tool_ground", "hallucination_scrape"],
  },
  dependency_whitelist: ["zod", "lodash"],
};

const { response, violations } = await runPipeline(request, adapter, config);
```

**Generated and written to disk:**

```typescript
import { writeFileSync } from "fs";
import type { GuardrailsConfig } from "@franken/firewall";

function generateConfig(options: {
  projectName: string;
  tier?: "STRICT" | "MODERATE" | "PERMISSIVE";
  providers?: ("anthropic" | "openai" | "local-ollama")[];
  budgetPerCallUsd?: number;
  redactPii?: boolean;
  whitelist?: string[];
}): GuardrailsConfig {
  return {
    project_name: options.projectName,
    security_tier: options.tier ?? "STRICT",
    schema_version: 1,
    agnostic_settings: {
      redact_pii: options.redactPii ?? true,
      max_token_spend_per_call: options.budgetPerCallUsd ?? 0.05,
      allowed_providers: options.providers ?? ["anthropic"],
    },
    safety_hooks: {
      pre_flight: ["injection_scan", "pii_mask", "budget_check"],
      post_flight: ["schema_enforce", "tool_ground", "hallucination_scrape"],
    },
    dependency_whitelist: options.whitelist ?? [],
  };
}

const config = generateConfig({
  projectName: "production-api",
  tier: "STRICT",
  providers: ["anthropic", "openai"],
  budgetPerCallUsd: 0.10,
  whitelist: ["react", "zod", "express", "lodash"],
});

writeFileSync("./guardrails.config.json", JSON.stringify(config, null, 2));
```

---

### Preset configs

Copy and adapt the preset that fits your use case.

#### Production — strict, single provider, full guardrails

```json
{
  "project_name": "production-api",
  "security_tier": "STRICT",
  "schema_version": 1,
  "agnostic_settings": {
    "redact_pii": true,
    "max_token_spend_per_call": 0.10,
    "allowed_providers": ["anthropic"]
  },
  "safety_hooks": {
    "pre_flight": ["injection_scan", "pii_mask", "budget_check"],
    "post_flight": ["schema_enforce", "tool_ground", "hallucination_scrape"]
  },
  "dependency_whitelist": []
}
```

#### Code generation — strict tier, dependency whitelist enforced

```json
{
  "project_name": "code-gen-service",
  "security_tier": "STRICT",
  "schema_version": 1,
  "agnostic_settings": {
    "redact_pii": true,
    "max_token_spend_per_call": 0.25,
    "allowed_providers": ["anthropic", "openai"]
  },
  "safety_hooks": {
    "pre_flight": ["injection_scan", "pii_mask", "budget_check"],
    "post_flight": ["schema_enforce", "tool_ground", "hallucination_scrape"]
  },
  "dependency_whitelist": [
    "react", "react-dom", "next", "typescript",
    "zod", "express", "lodash", "axios", "date-fns",
    "@types/node", "@types/react"
  ]
}
```

#### Customer-facing chatbot — PII mandatory, no code output expected

```json
{
  "project_name": "customer-support-bot",
  "security_tier": "STRICT",
  "schema_version": 1,
  "agnostic_settings": {
    "redact_pii": true,
    "max_token_spend_per_call": 0.03,
    "allowed_providers": ["openai"]
  },
  "safety_hooks": {
    "pre_flight": ["injection_scan", "pii_mask", "budget_check"],
    "post_flight": ["schema_enforce", "tool_ground"]
  },
  "dependency_whitelist": []
}
```

#### Internal tooling — moderate tier, higher budget

```json
{
  "project_name": "internal-tools",
  "security_tier": "MODERATE",
  "schema_version": 1,
  "agnostic_settings": {
    "redact_pii": true,
    "max_token_spend_per_call": 0.50,
    "allowed_providers": ["anthropic", "openai", "local-ollama"]
  },
  "safety_hooks": {
    "pre_flight": ["injection_scan", "pii_mask"],
    "post_flight": ["schema_enforce"]
  },
  "dependency_whitelist": []
}
```

#### Local development — permissive, no cost ceiling

```json
{
  "project_name": "local-dev",
  "security_tier": "PERMISSIVE",
  "schema_version": 1,
  "agnostic_settings": {
    "redact_pii": false,
    "max_token_spend_per_call": 999,
    "allowed_providers": ["anthropic", "openai", "local-ollama"]
  },
  "safety_hooks": {
    "pre_flight": [],
    "post_flight": []
  }
}
```

> **Warning:** Never use the local development preset in a production or shared environment. `redact_pii: false` means raw user data will be sent to provider APIs. `max_token_spend_per_call: 999` disables the budget guardrail.

---

### Violation codes

When a guardrail fires, the `GuardrailViolation` object always includes a `code`. Use these to route violations to different handlers in your application.

| Code | Raised by | Meaning |
| :--- | :--- | :--- |
| `INJECTION_DETECTED` | `InjectionScanner` | Request content matches a structural injection pattern |
| `PII_DETECTED` | `PiiMasker` | Reserved — masker redacts rather than blocks by default |
| `BUDGET_EXCEEDED` | `ProjectAlignmentChecker` | Estimated call cost exceeds `max_token_spend_per_call` |
| `PROVIDER_NOT_ALLOWED` | `ProjectAlignmentChecker` / `AdapterRegistry` | Provider is not in `allowed_providers` |
| `SCHEMA_MISMATCH` | `SchemaEnforcer` | Response does not conform to `UnifiedResponse` v1 shape |
| `TOOL_NOT_GROUNDED` | `DeterministicGrounder` / `ProjectAlignmentChecker` | Tool call references a function not in the Skill Registry |
| `HALLUCINATION_DETECTED` | `HallucinationScraper` | LLM output imports a package outside `dependency_whitelist` |
| `ADAPTER_ERROR` | `Pipeline` | Transport error, timeout, or non-2xx response from provider |
| `CONFIG_ERROR` | `loadConfig` | Config file is missing, malformed, or fails validation |

---

## Getting started

```bash
npm install
npm run build           # compile TypeScript to dist/
npm test                # 133 tests, all interceptors and adapters
npm run typecheck       # TypeScript strict mode
npm run lint            # ESLint
npx vitest bench        # performance baseline (~495K ops/sec)
```

**Prerequisites:**

- Node 18+
- A `guardrails.config.json` in your project root (or pass its path to `loadConfig()`).
- Provider API keys in the environment, e.g. `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, depending on which adapters you use.

---

## Usage

### 1. Config and adapter setup

Load policy from `guardrails.config.json` and register the adapters you need. Only providers listed in `allowed_providers` can be used.

```typescript
import {
  loadConfig,
  ClaudeAdapter,
  OpenAIAdapter,
  AdapterRegistry,
  runPipeline,
} from "@franken/firewall";  // or from "./src/index.js" if running from repo

const config = loadConfig("./guardrails.config.json");

const registry = new AdapterRegistry(config.agnostic_settings.allowed_providers);

if (config.agnostic_settings.allowed_providers.includes("anthropic")) {
  registry.register(
    "anthropic",
    new ClaudeAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-sonnet-4-6",
    })
  );
}

if (config.agnostic_settings.allowed_providers.includes("openai")) {
  registry.register(
    "openai",
    new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY!,
      model: "gpt-4o-mini",
    })
  );
}
```

### 2. Building a request

Every call uses the same `UnifiedRequest` shape. The pipeline never sees provider-specific fields.

```typescript
import type { UnifiedRequest } from "@franken/firewall";

const request: UnifiedRequest = {
  id: "req-001",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "What is 2 + 2?" }],
  max_tokens: 1024,
  session_id: "sess-abc",  // optional; used for cost ledger
};
```

With tools (optional):

```typescript
const requestWithTools: UnifiedRequest = {
  id: "req-002",
  provider: "openai",
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Get the weather in Boston." }],
  tools: [
    {
      name: "get_weather",
      description: "Returns current weather for a city.",
      input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  ],
  max_tokens: 512,
};
```

### 3. Running the pipeline and handling the result

Get the adapter for the request’s provider (throws if provider is not allowed or not registered), then run the pipeline. You always get a `UnifiedResponse` and an array of violations.

```typescript
const adapter = registry.getAdapter(request.provider);
const { response, violations } = await runPipeline(request, adapter, config);

if (violations.length > 0) {
  // Request was blocked or response was filtered. Never ignore violations.
  for (const v of violations) {
    console.error(`[${v.interceptor}] ${v.code}: ${v.message}`, v.payload ?? {});
  }
  // response.finish_reason is "content_filter"; response.content may be null
  return;
}

// Clean path: use the unified response
console.log(response.content);
console.log("Tokens:", response.usage.input_tokens, response.usage.output_tokens);
console.log("Cost USD:", response.usage.cost_usd);

if (response.finish_reason === "tool_use" && response.tool_calls.length > 0) {
  for (const tc of response.tool_calls) {
    console.log("Tool:", tc.function_name, tc.arguments);
  }
}
```

**Response fields:**

| Field | Description |
| :--- | :--- |
| `content` | Assistant text, or `null` if blocked or tool-only turn |
| `tool_calls` | Validated tool invocations (empty if none or if grounding failed) |
| `finish_reason` | `"stop"` \| `"tool_use"` \| `"length"` \| `"content_filter"` |
| `usage` | `input_tokens`, `output_tokens`, `cost_usd` |

When any guardrail blocks the request or filters the response, `finish_reason` is `"content_filter"` and `violations` contains at least one entry with `code`, `message`, `interceptor`, and optional `payload`.

### 4. With observability

Use `AuditLogger` for a structured log line per call and `CostLedger` to track spend per session.

```typescript
import { AuditLogger, CostLedger, runPipeline } from "@franken/firewall";

const logger = new AuditLogger();
const ledger = new CostLedger();

const startedAt = Date.now();
const { response, violations } = await runPipeline(request, adapter, config);

if (request.session_id) {
  ledger.record(request.session_id, response.usage.cost_usd);
  const total = ledger.getTotal(request.session_id);
  console.log(`Session ${request.session_id} total spend: $${total.toFixed(4)}`);
}

logger.log(
  logger.buildEntry({
    requestId: request.id,
    provider: request.provider,
    model: request.model,
    sessionId: request.session_id,
    violations,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd: response.usage.cost_usd,
    startedAt,
  })
);
```

### 5. Optional: Skill Registry (tool grounding)

To validate tool calls against a registry (e.g. MOD-02), pass a `SkillRegistryClient` in pipeline options. If you omit it, tool-call grounding is skipped.

```typescript
const skillRegistry = {
  hasSkill(name: string): boolean {
    return ["get_weather", "search"].includes(name);
  },
};

const { response, violations } = await runPipeline(
  request,
  adapter,
  config,
  { skillRegistry }
);
// If the model returns a tool_call whose function_name is not in the registry,
// violations will include TOOL_NOT_GROUNDED and response.finish_reason will be "content_filter".
```

### 6. Adding a new provider

```typescript
// src/adapters/my-provider/my-provider-adapter.ts
import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";

export class MyProviderAdapter extends BaseAdapter implements IAdapter {
  transformRequest(request: UnifiedRequest): MyProviderRequest { ... }
  async execute(req: unknown): Promise<unknown> {
    return this.withRetry(() => this.withTimeout(() => fetch(...)));
  }
  transformResponse(raw: unknown, requestId: string): UnifiedResponse { ... }
  validateCapabilities(feature: CapabilityFeature): boolean { ... }
}

// Register it
registry.register("my-provider", new MyProviderAdapter({ apiKey: "..." }));
```

That's it. The pipeline, all interceptors, and all tests require zero changes.

---

## Project structure

```text
src/
  types/                  Canonical schemas: UnifiedRequest, UnifiedResponse, GuardrailViolation
  config/                 Config loader and GuardrailsConfig interface
  adapters/
    claude/               ClaudeAdapter + recorded HTTP fixtures
    openai/               OpenAIAdapter + recorded HTTP fixtures
    base-adapter.ts       Shared retry, timeout, cost calculation
    adapter-registry.ts   Provider resolution against allowed_providers
    i-adapter.ts          IAdapter interface — the provider boundary
  interceptors/
    inbound/              InjectionScanner, PiiMasker, ProjectAlignmentChecker
    outbound/             SchemaEnforcer, DeterministicGrounder, HallucinationScraper
    interceptor-result.ts Pass/block result type
  pipeline/
    pipeline.ts           runPipeline() — composes all six interceptors
    pipeline.bench.ts     Performance baseline
  observability/
    audit-logger.ts       Structured JSON audit log per pipeline run
    cost-ledger.ts        In-memory session spend accumulator
  index.ts                Public module surface
docs/
  adr/                    Architecture Decision Records 0001–0007
guardrails.config.json    Example project policy config
```

---

## Decisions

Major architectural choices are recorded as ADRs in [`docs/adr/`](docs/adr/). Any non-obvious decision made during implementation has a corresponding record with context, decision, and consequences.

| ADR | Decision |
| :--- | :--- |
| [0001](docs/adr/0001-typescript-as-implementation-language.md) | TypeScript strict mode — schema violations caught at compile time |
| [0002](docs/adr/0002-unified-response-v1-canonical-contract.md) | `UnifiedResponse` v1 as the closed, versioned output contract |
| [0003](docs/adr/0003-four-method-adapter-contract.md) | Four-method adapter interface as the only provider boundary |
| [0004](docs/adr/0004-structural-intent-injection-scanning.md) | Structural intent over keyword matching for injection detection |
| [0005](docs/adr/0005-local-nlp-pii-masking.md) | Local regex PII masking — no data sent to an external masking service |
| [0006](docs/adr/0006-skill-registry-as-external-dependency.md) | Skill Registry as an injected interface, not a compile-time import |
| [0007](docs/adr/0007-in-memory-cost-ledger-for-v1.md) | In-memory `CostLedger` for v1 — external store is a v2 concern |

---

## Testing

133 tests across 18 test files. Every interceptor has pass, block, and edge-case coverage. Adapters use recorded HTTP fixtures — there are no live API calls in the test suite.

```bash
npm test                 # run all tests
npm run test:coverage    # with coverage report
npx vitest bench         # performance baseline
```

Pipeline throughput with all six interceptors active: **~495,000 ops/sec** (mean 0.002ms per run on an average payload).

---

## Roadmap

- [ ] `OllamaAdapter` — local model support
- [ ] Persistent `CostLedger` backend (Redis / Postgres)
- [ ] Streaming response support in the adapter contract
- [ ] Configurable injection pattern sets loaded from external policy files
- [ ] MOD-02: Skill Registry implementation

---

## License

MIT
