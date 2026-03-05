# Custom Adapter (Groq) -- Quickstart

Build your own LLM provider adapter from scratch. This example implements a complete `IAdapter` for [Groq Cloud](https://groq.com/), which exposes an OpenAI-compatible API -- making it an ideal template for adding DeepSeek, Together AI, Fireworks, or any other provider.

## Prerequisites

- Node.js >= 20
- A [Groq API key](https://console.groq.com/keys)

## Setup

1. Copy the environment template and add your API key:

```bash
cp .env.example .env
# Edit .env and replace gsk_... with your actual key
```

2. Install tsx (if not already available):

```bash
npm install -g tsx
```

## Run

From this directory:

```bash
npx tsx src/main.ts
```

Or from the project root:

```bash
npx tsx examples/quickstart/custom-adapter/src/main.ts
```

## Run Tests

From the project root:

```bash
npx vitest run --config examples/vitest.config.ts --dir examples/quickstart/custom-adapter/src
```

## How to Add Your Own LLM Provider

Every adapter in Frankenbeast implements the same 4-method `IAdapter` contract and extends `BaseAdapter` for free retry, timeout, and cost calculation. Here is the step-by-step pattern.

### Step 1: Define private request/response types

Create TypeScript interfaces for the provider's native API shapes. These types are **never exported** -- they exist only inside your adapter file. This keeps provider-specific concerns from leaking past the adapter boundary.

```typescript
// Private to this file -- never exported
interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  tools?: GroqTool[];
  max_tokens?: number;
}

interface GroqResponse {
  id: string;
  object: "chat.completion";
  model: string;
  choices: GroqChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
```

### Step 2: Extend BaseAdapter

`BaseAdapter` gives you retry with exponential backoff, timeout enforcement, and USD cost calculation -- all configured in the constructor. You never need to implement these yourself.

```typescript
export class GroqAdapter extends BaseAdapter implements IAdapter {
  constructor(config: GroqAdapterConfig) {
    super({
      retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
      timeout: { timeoutMs: 30_000 },
      costPerInputTokenM: 0.59,   // USD per 1M input tokens
      costPerOutputTokenM: 0.79,  // USD per 1M output tokens
    });
  }
}
```

### Step 3: Implement the 4 IAdapter methods

#### `transformRequest(request: UnifiedRequest): unknown`

Maps the provider-agnostic `UnifiedRequest` into the provider's native request format. This is where you convert the unified message array, system prompt, tool definitions, and parameters into whatever shape the provider expects.

```typescript
transformRequest(request: UnifiedRequest): GroqRequest {
  const messages: GroqMessage[] = [];
  if (request.system) {
    messages.push({ role: "system", content: request.system });
  }
  for (const msg of request.messages) {
    messages.push({ role: msg.role, content: msg.content as string });
  }
  return { model: this.model, messages };
}
```

#### `execute(providerRequest: unknown): Promise<unknown>`

Makes the actual HTTP call to the provider. Wrap it with `this.withRetry()` and `this.withTimeout()` to get BaseAdapter's retry and timeout logic for free.

```typescript
async execute(providerRequest: unknown): Promise<unknown> {
  return this.withRetry(() =>
    this.withTimeout(async () => {
      const response = await fetch(`${this.apiBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(providerRequest),
      });
      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${await response.text()}`);
      }
      return response.json();
    }),
  );
}
```

#### `transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse`

Maps the raw provider response back to the canonical `UnifiedResponse` shape. This is the only shape the pipeline and orchestrator ever see. Use `this.calculateCost()` from BaseAdapter to compute USD cost.

```typescript
transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse {
  const raw = providerResponse as GroqResponse;
  const choice = raw.choices[0]!;
  return {
    schema_version: 1,
    id: requestId,
    model_used: raw.model,
    content: choice.message.content,
    tool_calls: [],
    finish_reason: "stop",
    usage: {
      input_tokens: raw.usage.prompt_tokens,
      output_tokens: raw.usage.completion_tokens,
      cost_usd: this.calculateCost(raw.usage.prompt_tokens, raw.usage.completion_tokens),
    },
  };
}
```

#### `validateCapabilities(feature: CapabilityFeature): boolean`

Returns whether the configured model supports a given feature. Maintain a capability matrix mapping model names to supported features.

```typescript
const CAPABILITY_MATRIX: Record<string, CapabilityFeature[]> = {
  "llama-3.3-70b-versatile": ["function_calling", "system_prompt"],
  "llama-3.1-8b-instant": ["function_calling", "system_prompt"],
};

validateCapabilities(feature: CapabilityFeature): boolean {
  const supported = CAPABILITY_MATRIX[this.model] ?? [];
  return supported.includes(feature);
}
```

### Step 4: Add a capability matrix

The capability matrix is a simple lookup table that maps model identifiers to the features they support. The `CapabilityFeature` type defines the supported feature set: `"function_calling"`, `"vision"`, `"streaming"`, and `"system_prompt"`.

### Step 5: Write conformance tests

Test all four methods with fixture data -- no live API calls needed. The pattern is:

1. Create a fixture of the provider's raw response shape
2. Verify `transformRequest` produces the expected native request
3. Verify `transformResponse` returns a valid `UnifiedResponse` (schema_version, id, usage, etc.)
4. Verify `validateCapabilities` returns correct booleans for each model

```typescript
it("transformResponse returns UnifiedResponse v1 shape", () => {
  const adapter = new GroqAdapter({ apiKey: "test-key", model: "llama-3.3-70b-versatile" });
  const unified = adapter.transformResponse(GROQ_TEXT_RESPONSE, "req-001");
  expect(unified.schema_version).toBe(1);
  expect(unified.usage.cost_usd).toBeGreaterThanOrEqual(0);
});
```

## Adapting to Other Providers

To add a different provider (e.g., DeepSeek, Together AI, Fireworks):

1. Copy `groq-adapter.ts` as your starting point
2. Update the private types to match the new provider's API shape
3. Change the API base URL and auth header format
4. Update the capability matrix and pricing table
5. Adjust `transformRequest` / `transformResponse` for any API differences
6. Write conformance tests with the new provider's response fixtures

For OpenAI-compatible providers (most of them), the changes are minimal -- typically just the base URL, pricing, and capability matrix.

## What This Demonstrates

- **IAdapter contract** -- The four-method interface every provider adapter must implement.
- **BaseAdapter inheritance** -- Free retry with exponential backoff, timeout enforcement, and USD cost calculation.
- **Private provider types** -- Groq-specific request/response shapes that never leak past the adapter boundary.
- **Capability matrix** -- Per-model feature support lookup for function calling, vision, streaming, and system prompts.
- **Conformance testing** -- Fixture-based tests that validate adapter correctness without live API calls.
- **Cost calculation** -- Automatic USD cost computation based on per-model pricing ($0.59/M input, $0.79/M output for llama-3.3-70b).

## Expected Output

```
--- Frankenbeast: Custom Adapter (Groq) ---
Request ID: <uuid>
Model: llama-3.3-70b-versatile
Prompt: "Explain what a guardrail framework does in one sentence."

--- Response ---
Content: <Groq's response>
Finish reason: stop

--- Usage ---
Input tokens:  <number>
Output tokens: <number>
Cost (USD):    $<amount>

--- Capabilities ---
Function calling: true
Vision:           false
Streaming:        false
System prompt:    true
```
