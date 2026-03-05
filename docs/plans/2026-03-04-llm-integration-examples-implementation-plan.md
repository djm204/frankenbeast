# LLM Integration Examples — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create 10 runnable examples across 3 tiers (quickstart, patterns, scenarios) demonstrating Frankenbeast guardrail integrations with Claude, OpenAI, Ollama, and custom LLM providers.

**Architecture:** Each example is a self-contained directory under `examples/` with README.md, package.json, src/main.ts, and .env.example. Examples import from workspace-linked frankenbeast modules via path aliases. Execution via `npx tsx src/main.ts`.

**Tech Stack:** TypeScript, tsx, Vitest (tests only), Hono (scenario servers), Ollama (local models)

**Design doc:** `docs/plans/2026-03-04-llm-integration-examples-design.md`

---

## Prerequisites

Before starting, verify the workspace builds:

```bash
cd /home/pfk/dev/frankenbeast
npm run build
```

Key module imports used throughout:
- `@franken/firewall` → `frankenfirewall/src/index.ts`
- `@franken/types` → `franken-types/src/index.ts`
- `@frankenbeast/observer` → `franken-observer/src/index.ts`
- `franken-orchestrator` → `franken-orchestrator/src/index.ts`

---

## Task 1: Root examples infrastructure

**Files:**
- Create: `examples/tsconfig.json`
- Modify: `tsconfig.json` (root — add examples to includes)
- Modify: `vitest.config.ts` (root — if needed for example tests)

**Step 1: Create shared tsconfig for examples**

```json
// examples/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".."
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "**/dist"]
}
```

**Step 2: Verify it extends root aliases**

Run: `npx tsc --noEmit -p examples/tsconfig.json`
Expected: 0 errors (no .ts files yet, just validates config)

**Step 3: Commit**

```bash
git add examples/tsconfig.json
git commit -m "chore: add shared tsconfig for examples directory"
```

---

## Task 2: Quickstart — claude-hello

**Files:**
- Create: `examples/quickstart/claude-hello/package.json`
- Create: `examples/quickstart/claude-hello/.env.example`
- Create: `examples/quickstart/claude-hello/src/main.ts`
- Create: `examples/quickstart/claude-hello/README.md`

**Step 1: Create package.json**

```json
{
  "name": "@franken/example-claude-hello",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx tsx src/main.ts"
  },
  "dependencies": {}
}
```

**Step 2: Create .env.example**

```
# Get your API key from https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 3: Create src/main.ts**

This is a minimal ~50 LOC script that:
1. Creates a `ClaudeAdapter` with the API key from env
2. Creates an `AdapterRegistry` with `anthropic` allowed
3. Builds a `UnifiedRequest`
4. Calls `adapter.transformRequest()` → `adapter.execute()` → `adapter.transformResponse()`
5. Prints the `UnifiedResponse` with cost breakdown

```typescript
// examples/quickstart/claude-hello/src/main.ts
import { ClaudeAdapter } from "../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY in your environment or .env file");
  process.exit(1);
}

const adapter = new ClaudeAdapter({
  apiKey,
  model: "claude-sonnet-4-6",
});

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  system: "You are a helpful assistant. Be concise.",
  messages: [
    { role: "user", content: "Explain what a guardrail framework does in one sentence." },
  ],
  max_tokens: 256,
};

console.log("--- Frankenbeast: Claude Hello ---");
console.log(`Request ID: ${request.id}`);
console.log(`Model: ${request.model}`);
console.log(`Prompt: "${request.messages[0]!.content}"`);
console.log();

try {
  const providerRequest = adapter.transformRequest(request);
  const rawResponse = await adapter.execute(providerRequest);
  const unified = adapter.transformResponse(rawResponse, request.id);

  console.log("--- Response ---");
  console.log(`Content: ${unified.content}`);
  console.log(`Finish reason: ${unified.finish_reason}`);
  console.log();
  console.log("--- Usage ---");
  console.log(`Input tokens:  ${unified.usage.input_tokens}`);
  console.log(`Output tokens: ${unified.usage.output_tokens}`);
  console.log(`Cost (USD):    $${unified.usage.cost_usd.toFixed(6)}`);
  console.log();
  console.log("--- Capabilities ---");
  console.log(`Function calling: ${adapter.validateCapabilities("function_calling")}`);
  console.log(`Vision:           ${adapter.validateCapabilities("vision")}`);
  console.log(`Streaming:        ${adapter.validateCapabilities("streaming")}`);
  console.log(`System prompt:    ${adapter.validateCapabilities("system_prompt")}`);
} catch (err) {
  console.error("Request failed:", err);
  process.exit(1);
}
```

**Step 4: Create README.md**

```markdown
# Claude Hello — Quickstart

Send a single prompt to Claude through the Frankenbeast adapter layer and see the guardrail-normalized response.

## Prerequisites

- Node.js >= 20
- An Anthropic API key ([get one here](https://console.anthropic.com/))

## Setup

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Add your Anthropic API key to `.env`

## Run

```bash
npx tsx src/main.ts
```

## What this demonstrates

- Creating a `ClaudeAdapter` with the 4-method `IAdapter` contract
- Sending a `UnifiedRequest` and receiving a normalized `UnifiedResponse`
- Cost calculation (input/output tokens → USD)
- Capability validation per model

## Expected output

```
--- Frankenbeast: Claude Hello ---
Request ID: <uuid>
Model: claude-sonnet-4-6
Prompt: "Explain what a guardrail framework does in one sentence."

--- Response ---
Content: A guardrail framework enforces safety constraints...
Finish reason: stop

--- Usage ---
Input tokens:  25
Output tokens: 32
Cost (USD):    $0.000555

--- Capabilities ---
Function calling: true
Vision:           true
Streaming:        false
System prompt:    true
```
```

**Step 5: Verify TypeScript compiles (dry run)**

Run: `npx tsc --noEmit -p examples/tsconfig.json`
Expected: No type errors

**Step 6: Commit**

```bash
git add examples/quickstart/claude-hello/
git commit -m "feat(examples): add claude-hello quickstart"
```

---

## Task 3: Quickstart — openai-hello

**Files:**
- Create: `examples/quickstart/openai-hello/package.json`
- Create: `examples/quickstart/openai-hello/.env.example`
- Create: `examples/quickstart/openai-hello/src/main.ts`
- Create: `examples/quickstart/openai-hello/README.md`

**Step 1: Create package.json**

```json
{
  "name": "@franken/example-openai-hello",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx tsx src/main.ts"
  },
  "dependencies": {}
}
```

**Step 2: Create .env.example**

```
# Get your API key from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...
```

**Step 3: Create src/main.ts**

Same pattern as claude-hello but with `OpenAIAdapter`:

```typescript
// examples/quickstart/openai-hello/src/main.ts
import { OpenAIAdapter } from "../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Set OPENAI_API_KEY in your environment or .env file");
  process.exit(1);
}

const adapter = new OpenAIAdapter({
  apiKey,
  model: "gpt-4o",
});

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "openai",
  model: "gpt-4o",
  system: "You are a helpful assistant. Be concise.",
  messages: [
    { role: "user", content: "Explain what a guardrail framework does in one sentence." },
  ],
  max_tokens: 256,
};

console.log("--- Frankenbeast: OpenAI Hello ---");
console.log(`Request ID: ${request.id}`);
console.log(`Model: ${request.model}`);
console.log(`Prompt: "${request.messages[0]!.content}"`);
console.log();

try {
  const providerRequest = adapter.transformRequest(request);
  const rawResponse = await adapter.execute(providerRequest);
  const unified = adapter.transformResponse(rawResponse, request.id);

  console.log("--- Response ---");
  console.log(`Content: ${unified.content}`);
  console.log(`Finish reason: ${unified.finish_reason}`);
  console.log();
  console.log("--- Usage ---");
  console.log(`Input tokens:  ${unified.usage.input_tokens}`);
  console.log(`Output tokens: ${unified.usage.output_tokens}`);
  console.log(`Cost (USD):    $${unified.usage.cost_usd.toFixed(6)}`);
  console.log();
  console.log("--- Capabilities ---");
  console.log(`Function calling: ${adapter.validateCapabilities("function_calling")}`);
  console.log(`Vision:           ${adapter.validateCapabilities("vision")}`);
  console.log(`Streaming:        ${adapter.validateCapabilities("streaming")}`);
  console.log(`System prompt:    ${adapter.validateCapabilities("system_prompt")}`);
} catch (err) {
  console.error("Request failed:", err);
  process.exit(1);
}
```

**Step 4: Create README.md**

Same structure as claude-hello README but referencing OpenAI. Key differences: `OPENAI_API_KEY`, `gpt-4o` model, `$5/M input, $15/M output` pricing.

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p examples/tsconfig.json`

**Step 6: Commit**

```bash
git add examples/quickstart/openai-hello/
git commit -m "feat(examples): add openai-hello quickstart"
```

---

## Task 4: Quickstart — ollama-hello

**Files:**
- Create: `examples/quickstart/ollama-hello/package.json`
- Create: `examples/quickstart/ollama-hello/.env.example`
- Create: `examples/quickstart/ollama-hello/src/main.ts`
- Create: `examples/quickstart/ollama-hello/setup-ollama.sh`
- Create: `examples/quickstart/ollama-hello/README.md`

**Step 1: Create package.json**

```json
{
  "name": "@franken/example-ollama-hello",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx tsx src/main.ts",
    "setup": "bash setup-ollama.sh"
  },
  "dependencies": {}
}
```

**Step 2: Create .env.example**

```
# Ollama runs locally — no API key needed!
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

**Step 3: Create setup-ollama.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Ollama Setup ==="

# Check if ollama is installed
if ! command -v ollama &> /dev/null; then
  echo "Ollama not found. Install from: https://ollama.com/download"
  exit 1
fi

echo "Pulling llama3.2 (small, fast — ~2GB)..."
ollama pull llama3.2

echo "Verifying model is available..."
ollama list | grep llama3.2

echo "Done! Run the example with: npx tsx src/main.ts"
```

**Step 4: Create src/main.ts**

```typescript
// examples/quickstart/ollama-hello/src/main.ts
import { OllamaAdapter } from "../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const model = process.env.OLLAMA_MODEL ?? "llama3.2";

const adapter = new OllamaAdapter({ baseUrl, model });

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "local-ollama",
  model,
  system: "You are a helpful assistant. Be concise.",
  messages: [
    { role: "user", content: "Explain what a guardrail framework does in one sentence." },
  ],
  max_tokens: 256,
};

console.log("--- Frankenbeast: Ollama Hello ---");
console.log(`Request ID: ${request.id}`);
console.log(`Model: ${request.model} (local)`);
console.log(`Endpoint: ${baseUrl}`);
console.log(`Prompt: "${request.messages[0]!.content}"`);
console.log(`Cost: $0.00 (local model)`);
console.log();

try {
  const providerRequest = adapter.transformRequest(request);
  const rawResponse = await adapter.execute(providerRequest);
  const unified = adapter.transformResponse(rawResponse, request.id);

  console.log("--- Response ---");
  console.log(`Content: ${unified.content}`);
  console.log(`Finish reason: ${unified.finish_reason}`);
  console.log();
  console.log("--- Usage ---");
  console.log(`Input tokens:  ${unified.usage.input_tokens}`);
  console.log(`Output tokens: ${unified.usage.output_tokens}`);
  console.log(`Cost (USD):    $${unified.usage.cost_usd.toFixed(6)} (always zero for local)`);
  console.log();
  console.log("--- Capabilities ---");
  console.log(`Function calling: ${adapter.validateCapabilities("function_calling")}`);
  console.log(`Vision:           ${adapter.validateCapabilities("vision")}`);
  console.log(`System prompt:    ${adapter.validateCapabilities("system_prompt")}`);
} catch (err) {
  console.error("Request failed. Is Ollama running? Try: ollama serve");
  console.error(err);
  process.exit(1);
}
```

**Step 5: Create README.md**

Emphasis on: no API key, zero cost, privacy (no data leaves your machine), local-first. Include Ollama installation steps for Linux/macOS/Windows.

**Step 6: Make setup script executable and commit**

```bash
chmod +x examples/quickstart/ollama-hello/setup-ollama.sh
git add examples/quickstart/ollama-hello/
git commit -m "feat(examples): add ollama-hello quickstart with local model setup"
```

---

## Task 5: Quickstart — custom-adapter

**Files:**
- Create: `examples/quickstart/custom-adapter/package.json`
- Create: `examples/quickstart/custom-adapter/.env.example`
- Create: `examples/quickstart/custom-adapter/src/groq-adapter.ts`
- Create: `examples/quickstart/custom-adapter/src/main.ts`
- Create: `examples/quickstart/custom-adapter/src/groq-adapter.test.ts`
- Create: `examples/quickstart/custom-adapter/README.md`

**Step 1: Create package.json**

```json
{
  "name": "@franken/example-custom-adapter",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx tsx src/main.ts",
    "test": "npx vitest run src/"
  },
  "dependencies": {},
  "devDependencies": {
    "vitest": "^4.0.18"
  }
}
```

**Step 2: Create .env.example**

```
# Get your API key from https://console.groq.com/keys
GROQ_API_KEY=gsk_...
```

**Step 3: Write the conformance test first (TDD)**

```typescript
// examples/quickstart/custom-adapter/src/groq-adapter.test.ts
import { describe, it, expect } from "vitest";
import { GroqAdapter } from "./groq-adapter.js";
import type { UnifiedRequest } from "../../../../frankenfirewall/src/types/unified-request.js";

// Groq uses OpenAI-compatible API, so response shape matches OpenAI
const GROQ_TEXT_RESPONSE = {
  id: "chatcmpl-123",
  object: "chat.completion",
  model: "llama-3.3-70b-versatile",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from Groq!", tool_calls: undefined },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
};

const SIMPLE_REQUEST: UnifiedRequest = {
  id: "req-001",
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello" }],
};

describe("GroqAdapter", () => {
  const factory = () =>
    new GroqAdapter({ apiKey: "test-key", model: "llama-3.3-70b-versatile" });

  it("transformRequest produces valid Groq request shape", () => {
    const adapter = factory();
    const transformed = adapter.transformRequest(SIMPLE_REQUEST) as Record<string, unknown>;
    expect(transformed).toHaveProperty("model", "llama-3.3-70b-versatile");
    expect(transformed).toHaveProperty("messages");
  });

  it("transformResponse returns UnifiedResponse v1 shape", () => {
    const adapter = factory();
    const unified = adapter.transformResponse(GROQ_TEXT_RESPONSE, "req-001");

    expect(unified.schema_version).toBe(1);
    expect(unified.id).toBe("req-001");
    expect(unified.model_used).toBe("llama-3.3-70b-versatile");
    expect(unified.content).toBe("Hello from Groq!");
    expect(unified.tool_calls).toEqual([]);
    expect(unified.finish_reason).toBe("stop");
    expect(unified.usage.input_tokens).toBe(20);
    expect(unified.usage.output_tokens).toBe(5);
    expect(unified.usage.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("validateCapabilities returns booleans", () => {
    const adapter = factory();
    expect(typeof adapter.validateCapabilities("function_calling")).toBe("boolean");
    expect(typeof adapter.validateCapabilities("vision")).toBe("boolean");
    expect(typeof adapter.validateCapabilities("system_prompt")).toBe("boolean");
  });

  it("reports function_calling support for llama-3.3-70b", () => {
    const adapter = factory();
    expect(adapter.validateCapabilities("function_calling")).toBe(true);
    expect(adapter.validateCapabilities("system_prompt")).toBe(true);
  });
});
```

**Step 4: Run test to verify it fails**

Run: `npx vitest run examples/quickstart/custom-adapter/src/groq-adapter.test.ts`
Expected: FAIL — `GroqAdapter` doesn't exist yet

**Step 5: Implement GroqAdapter**

```typescript
// examples/quickstart/custom-adapter/src/groq-adapter.ts
//
// Example: Build your own Frankenbeast adapter for Groq.
// Groq uses an OpenAI-compatible API, so the shape is familiar.
// This file shows the 4 methods you must implement.
//
import { BaseAdapter } from "../../../../frankenfirewall/src/adapters/base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../../../../frankenfirewall/src/adapters/i-adapter.js";
import type { UnifiedRequest, UnifiedResponse, ToolCall } from "../../../../frankenfirewall/src/types/index.js";

// --- Groq-specific types (keep private to this file) ---

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string | null;
}

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  max_tokens?: number;
}

interface GroqChoice {
  index: number;
  message: { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] };
  finish_reason: "stop" | "tool_calls" | "length";
}

interface GroqResponse {
  id: string;
  model: string;
  choices: GroqChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// --- Capability matrix ---

const CAPABILITY_MATRIX: Record<string, CapabilityFeature[]> = {
  "llama-3.3-70b-versatile": ["function_calling", "system_prompt"],
  "llama-3.1-8b-instant": ["function_calling", "system_prompt"],
  "mixtral-8x7b-32768": ["function_calling", "system_prompt"],
  "gemma2-9b-it": ["system_prompt"],
};

// --- Adapter ---

export interface GroqAdapterConfig {
  apiKey: string;
  model: string;
  apiBaseUrl?: string;
}

export class GroqAdapter extends BaseAdapter implements IAdapter {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;

  constructor(config: GroqAdapterConfig) {
    super({
      retry: { maxAttempts: 3, initialDelayMs: 200, backoffMultiplier: 2 },
      timeout: { timeoutMs: 30_000 },
      // Groq pricing: varies by model, using llama-3.3-70b rates
      costPerInputTokenM: 0.59,
      costPerOutputTokenM: 0.79,
    });
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.apiBaseUrl = config.apiBaseUrl ?? "https://api.groq.com/openai";
  }

  // METHOD 1: Map UnifiedRequest → provider-native format
  transformRequest(request: UnifiedRequest): GroqRequest {
    if (request.tools?.length && !this.validateCapabilities("function_calling")) {
      throw this.makeViolation(
        `Model "${this.model}" does not support function_calling`,
        { model: this.model },
      );
    }

    const messages: GroqMessage[] = [];
    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }
    for (const msg of request.messages) {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: typeof msg.content === "string" ? msg.content : msg.content.map(b => b.text ?? "").join("\n"),
      });
    }

    const groqRequest: GroqRequest = { model: this.model, messages };
    if (request.max_tokens) groqRequest.max_tokens = request.max_tokens;
    if (request.tools?.length) {
      groqRequest.tools = request.tools.map(t => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }
    return groqRequest;
  }

  // METHOD 2: Execute the HTTP call (with retry + timeout from BaseAdapter)
  async execute(providerRequest: unknown): Promise<unknown> {
    return this.withRetry(() =>
      this.withTimeout(async () => {
        const res = await fetch(`${this.apiBaseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(providerRequest),
        });
        if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
        return res.json() as Promise<unknown>;
      }),
    );
  }

  // METHOD 3: Map raw provider response → canonical UnifiedResponse
  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse {
    const raw = providerResponse as GroqResponse;
    const choice = raw.choices[0];
    if (!choice) throw this.makeViolation("Groq response has no choices");

    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      function_name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    const inputTokens = raw.usage.prompt_tokens;
    const outputTokens = raw.usage.completion_tokens;

    const finishReason = choice.finish_reason === "tool_calls" ? "tool_use" as const
      : choice.finish_reason === "length" ? "length" as const
      : "stop" as const;

    return {
      schema_version: 1,
      id: requestId,
      model_used: raw.model,
      content: choice.message.content,
      tool_calls: toolCalls,
      finish_reason: finishReason,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens),
      },
    };
  }

  // METHOD 4: Self-report model capabilities
  validateCapabilities(feature: CapabilityFeature): boolean {
    return (CAPABILITY_MATRIX[this.model] ?? []).includes(feature);
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run examples/quickstart/custom-adapter/src/groq-adapter.test.ts`
Expected: All 4 tests PASS

**Step 7: Create src/main.ts**

```typescript
// examples/quickstart/custom-adapter/src/main.ts
import { GroqAdapter } from "./groq-adapter.js";
import type { UnifiedRequest } from "../../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Set GROQ_API_KEY in your environment or .env file");
  process.exit(1);
}

const adapter = new GroqAdapter({
  apiKey,
  model: "llama-3.3-70b-versatile",
});

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  system: "You are a helpful assistant. Be concise.",
  messages: [
    { role: "user", content: "Explain what a guardrail framework does in one sentence." },
  ],
  max_tokens: 256,
};

console.log("--- Frankenbeast: Custom Adapter (Groq) ---");
console.log(`Request ID: ${request.id}`);
console.log(`Model: ${request.model}`);
console.log(`Prompt: "${request.messages[0]!.content}"`);
console.log();

try {
  const providerRequest = adapter.transformRequest(request);
  const rawResponse = await adapter.execute(providerRequest);
  const unified = adapter.transformResponse(rawResponse, request.id);

  console.log("--- Response ---");
  console.log(`Content: ${unified.content}`);
  console.log(`Finish reason: ${unified.finish_reason}`);
  console.log();
  console.log("--- Usage ---");
  console.log(`Input tokens:  ${unified.usage.input_tokens}`);
  console.log(`Output tokens: ${unified.usage.output_tokens}`);
  console.log(`Cost (USD):    $${unified.usage.cost_usd.toFixed(6)}`);
} catch (err) {
  console.error("Request failed:", err);
  process.exit(1);
}
```

**Step 8: Create README.md**

Focus on: step-by-step "add your own LLM provider" guide. Walk through the 4 IAdapter methods, show how BaseAdapter gives retry/timeout/cost for free, explain the conformance test pattern.

**Step 9: Commit**

```bash
git add examples/quickstart/custom-adapter/
git commit -m "feat(examples): add custom-adapter quickstart with Groq IAdapter implementation"
```

---

## Task 6: Pattern — multi-provider-fallback

**Files:**
- Create: `examples/patterns/multi-provider-fallback/package.json`
- Create: `examples/patterns/multi-provider-fallback/.env.example`
- Create: `examples/patterns/multi-provider-fallback/src/main.ts`
- Create: `examples/patterns/multi-provider-fallback/README.md`

**Step 1: Create package.json and .env.example**

package.json same structure as quickstarts. .env.example:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OLLAMA_BASE_URL=http://localhost:11434
```

**Step 2: Create src/main.ts**

This example demonstrates a fallback chain: Claude → OpenAI → Ollama.

```typescript
// examples/patterns/multi-provider-fallback/src/main.ts
import { ClaudeAdapter } from "../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import { OpenAIAdapter } from "../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import { OllamaAdapter } from "../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { IAdapter } from "../../../frankenfirewall/src/adapters/i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../../frankenfirewall/src/types/index.js";
import { randomUUID } from "node:crypto";

// --- Build the fallback chain ---
// Each entry: [name, adapter factory, requires env var]
type ProviderEntry = { name: string; adapter: IAdapter };

function buildFallbackChain(): ProviderEntry[] {
  const chain: ProviderEntry[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    chain.push({
      name: "Claude (claude-sonnet-4-6)",
      adapter: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" }),
    });
  }

  if (process.env.OPENAI_API_KEY) {
    chain.push({
      name: "OpenAI (gpt-4o)",
      adapter: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY, model: "gpt-4o" }),
    });
  }

  // Ollama is always available as the local fallback (no API key)
  chain.push({
    name: "Ollama (llama3.2, local)",
    adapter: new OllamaAdapter({
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: "llama3.2",
    }),
  });

  return chain;
}

// --- Execute with fallback ---
async function executeWithFallback(
  chain: ProviderEntry[],
  request: UnifiedRequest,
): Promise<{ response: UnifiedResponse; provider: string; attempts: string[] }> {
  const attempts: string[] = [];

  for (const { name, adapter } of chain) {
    try {
      console.log(`  Trying: ${name}...`);
      const providerReq = adapter.transformRequest(request);
      const rawRes = await adapter.execute(providerReq);
      const unified = adapter.transformResponse(rawRes, request.id);
      return { response: unified, provider: name, attempts: [...attempts, `${name}: SUCCESS`] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push(`${name}: FAILED (${message})`);
      console.log(`  Failed: ${name} — ${message}`);
    }
  }

  throw new Error(`All ${chain.length} providers failed:\n${attempts.join("\n")}`);
}

// --- Main ---
const chain = buildFallbackChain();
console.log("--- Frankenbeast: Multi-Provider Fallback ---");
console.log(`Fallback chain: ${chain.map(p => p.name).join(" → ")}`);
console.log();

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "multi", // not used by adapters directly
  model: "auto",
  system: "You are a helpful assistant. Be concise.",
  messages: [
    { role: "user", content: "What are the benefits of using a multi-provider LLM strategy?" },
  ],
  max_tokens: 256,
};

try {
  const { response, provider, attempts } = await executeWithFallback(chain, request);

  console.log();
  console.log("--- Attempts ---");
  for (const a of attempts) console.log(`  ${a}`);
  console.log();
  console.log(`--- Response (from ${provider}) ---`);
  console.log(`Content: ${response.content}`);
  console.log(`Cost: $${response.usage.cost_usd.toFixed(6)}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
```

**Step 3: Create README.md**

Explain: fallback chains for resilience, cost comparison across providers, graceful degradation to local models.

**Step 4: Commit**

```bash
git add examples/patterns/multi-provider-fallback/
git commit -m "feat(examples): add multi-provider-fallback pattern"
```

---

## Task 7: Pattern — cost-aware-routing

**Files:**
- Create: `examples/patterns/cost-aware-routing/package.json`
- Create: `examples/patterns/cost-aware-routing/.env.example`
- Create: `examples/patterns/cost-aware-routing/src/main.ts`
- Create: `examples/patterns/cost-aware-routing/README.md`

**Step 1: Create package.json and .env.example**

Same pattern. .env needs all 3 provider keys (Ollama optional — always free).

**Step 2: Create src/main.ts**

```typescript
// examples/patterns/cost-aware-routing/src/main.ts
import { ClaudeAdapter } from "../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import { OpenAIAdapter } from "../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import { OllamaAdapter } from "../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { IAdapter } from "../../../frankenfirewall/src/adapters/i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../../frankenfirewall/src/types/index.js";
import { randomUUID } from "node:crypto";

// --- Provider definitions with cost tiers ---

interface ProviderTier {
  name: string;
  adapter: IAdapter;
  costPerInputTokenM: number;  // USD per 1M input tokens
  costPerOutputTokenM: number; // USD per 1M output tokens
  tier: "free" | "cheap" | "premium";
}

function buildProviders(): ProviderTier[] {
  const providers: ProviderTier[] = [];

  // Free tier: Ollama (local)
  providers.push({
    name: "Ollama/llama3.2",
    adapter: new OllamaAdapter({
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: "llama3.2",
    }),
    costPerInputTokenM: 0,
    costPerOutputTokenM: 0,
    tier: "free",
  });

  // Cheap tier: OpenAI mini
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: "OpenAI/gpt-4o-mini",
      adapter: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY, model: "gpt-4o-mini" }),
      costPerInputTokenM: 0.15,
      costPerOutputTokenM: 0.6,
      tier: "cheap",
    });
  }

  // Premium tier: Claude Sonnet
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      name: "Claude/sonnet-4",
      adapter: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" }),
      costPerInputTokenM: 3,
      costPerOutputTokenM: 15,
      tier: "premium",
    });
  }

  return providers;
}

// --- Complexity estimator ---
// Simple heuristic: short prompts → free, medium → cheap, long/complex → premium

type Complexity = "simple" | "moderate" | "complex";

function estimateComplexity(messages: UnifiedRequest["messages"]): Complexity {
  const totalChars = messages.reduce((sum, m) => {
    const text = typeof m.content === "string" ? m.content : m.content.map(b => b.text ?? "").join("");
    return sum + text.length;
  }, 0);

  if (totalChars < 100) return "simple";
  if (totalChars < 500) return "moderate";
  return "complex";
}

function selectProvider(providers: ProviderTier[], complexity: Complexity): ProviderTier {
  const tierMap: Record<Complexity, string[]> = {
    simple: ["free", "cheap", "premium"],
    moderate: ["cheap", "premium", "free"],
    complex: ["premium", "cheap", "free"],
  };

  const preferredTiers = tierMap[complexity];
  for (const tier of preferredTiers) {
    const match = providers.find(p => p.tier === tier);
    if (match) return match;
  }
  return providers[0]!; // fallback to first available
}

// --- Main ---
const providers = buildProviders();
console.log("--- Frankenbeast: Cost-Aware Routing ---");
console.log(`Available providers: ${providers.map(p => `${p.name} (${p.tier})`).join(", ")}`);
console.log();

// Run 3 prompts of different complexity
const prompts: Array<{ label: string; content: string }> = [
  { label: "Simple", content: "Hi!" },
  { label: "Moderate", content: "Explain the difference between TCP and UDP protocols, including their use cases and trade-offs in modern distributed systems." },
  { label: "Complex", content: `Analyze the following code for security vulnerabilities and suggest fixes. Consider OWASP top 10, injection attacks, and authentication bypasses. The code handles user registration with email verification, password hashing, and session management. It connects to PostgreSQL via an ORM and exposes REST endpoints through Express.js. Pay special attention to the middleware chain and error handling paths. Here is the code:\n\n${"// ... (imagine 500+ chars of code here)\n".repeat(3)}` },
];

for (const { label, content } of prompts) {
  const messages = [{ role: "user" as const, content }];
  const complexity = estimateComplexity(messages);
  const selected = selectProvider(providers, complexity);

  console.log(`[${label}] Complexity: ${complexity} → Routing to: ${selected.name} (${selected.tier})`);

  const request: UnifiedRequest = {
    id: randomUUID(),
    provider: selected.name,
    model: "auto",
    messages,
    max_tokens: 128,
  };

  try {
    const providerReq = selected.adapter.transformRequest(request);
    const rawRes = await selected.adapter.execute(providerReq);
    const unified = selected.adapter.transformResponse(rawRes, request.id);
    console.log(`  Response: ${unified.content?.slice(0, 80)}...`);
    console.log(`  Cost: $${unified.usage.cost_usd.toFixed(6)} | Tokens: ${unified.usage.input_tokens}+${unified.usage.output_tokens}`);
  } catch (err) {
    console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log();
}
```

**Step 3: Create README.md and commit**

```bash
git add examples/patterns/cost-aware-routing/
git commit -m "feat(examples): add cost-aware-routing pattern with complexity-based provider selection"
```

---

## Task 8: Pattern — tool-calling

**Files:**
- Create: `examples/patterns/tool-calling/package.json`
- Create: `examples/patterns/tool-calling/.env.example`
- Create: `examples/patterns/tool-calling/src/main.ts`
- Create: `examples/patterns/tool-calling/README.md`

**Step 1: Create package.json and .env.example**

**Step 2: Create src/main.ts**

Defines 2 tools, sends a tool-calling request, shows how `UnifiedResponse.tool_calls` comes back normalized.

```typescript
// examples/patterns/tool-calling/src/main.ts
import { ClaudeAdapter } from "../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import { OpenAIAdapter } from "../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import type { IAdapter } from "../../../frankenfirewall/src/adapters/i-adapter.js";
import type { UnifiedRequest, ToolDefinition } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

// --- Define tools ---

const tools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a location",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City and state, e.g. 'San Francisco, CA'" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature unit" },
      },
      required: ["location"],
    },
  },
  {
    name: "search_docs",
    description: "Search internal documentation for a topic",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: { type: "number", description: "Maximum results to return" },
      },
      required: ["query"],
    },
  },
];

// --- Pick provider ---

type ProviderChoice = { name: string; adapter: IAdapter };

function pickProvider(): ProviderChoice {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: "Claude",
      adapter: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" }),
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "OpenAI",
      adapter: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY, model: "gpt-4o" }),
    };
  }
  console.error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY");
  process.exit(1);
}

// --- Main ---

const { name: providerName, adapter } = pickProvider();

console.log("--- Frankenbeast: Tool Calling Through Guardrails ---");
console.log(`Provider: ${providerName}`);
console.log(`Tools defined: ${tools.map(t => t.name).join(", ")}`);
console.log(`Function calling support: ${adapter.validateCapabilities("function_calling")}`);
console.log();

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: providerName.toLowerCase(),
  model: "auto",
  system: "You are a helpful assistant. Use tools when appropriate.",
  messages: [
    { role: "user", content: "What's the weather like in San Francisco? Also search our docs for 'deployment guide'." },
  ],
  tools,
  max_tokens: 1024,
};

try {
  const providerReq = adapter.transformRequest(request);
  const rawRes = await adapter.execute(providerReq);
  const unified = adapter.transformResponse(rawRes, request.id);

  console.log("--- Response ---");
  console.log(`Content: ${unified.content ?? "(no text — tool calls only)"}`);
  console.log(`Finish reason: ${unified.finish_reason}`);
  console.log();

  if (unified.tool_calls.length > 0) {
    console.log("--- Tool Calls (Normalized UnifiedResponse.tool_calls) ---");
    for (const tc of unified.tool_calls) {
      console.log(`  Tool: ${tc.function_name}`);
      console.log(`  ID:   ${tc.id}`);
      console.log(`  Args: ${tc.arguments}`);
      console.log();
    }
    console.log("Note: Regardless of provider (Claude, OpenAI, etc.), tool_calls");
    console.log("always have the same shape: { id, function_name, arguments }");
  }

  console.log();
  console.log("--- Usage ---");
  console.log(`Cost: $${unified.usage.cost_usd.toFixed(6)}`);
} catch (err) {
  console.error("Request failed:", err);
  process.exit(1);
}
```

**Step 3: Create README.md and commit**

```bash
git add examples/patterns/tool-calling/
git commit -m "feat(examples): add tool-calling pattern with normalized tool_calls output"
```

---

## Task 9: Pattern — local-model-gallery

**Files:**
- Create: `examples/patterns/local-model-gallery/package.json`
- Create: `examples/patterns/local-model-gallery/.env.example`
- Create: `examples/patterns/local-model-gallery/src/main.ts`
- Create: `examples/patterns/local-model-gallery/setup-models.sh`
- Create: `examples/patterns/local-model-gallery/README.md`

**Step 1: Create package.json and .env.example**

**Step 2: Create setup-models.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Pulling models for Local Model Gallery ==="

models=("llama3.2" "mistral" "qwen2.5" "codellama")

for model in "${models[@]}"; do
  echo "Pulling $model..."
  ollama pull "$model"
done

echo "All models pulled. Run: npx tsx src/main.ts"
```

**Step 3: Create src/main.ts**

```typescript
// examples/patterns/local-model-gallery/src/main.ts
import { OllamaAdapter } from "../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const prompt = "Explain what a guardrail framework does in one sentence.";

const models = [
  { name: "llama3.2", description: "Meta Llama 3.2 — fast, general purpose" },
  { name: "mistral", description: "Mistral 7B — balanced quality/speed" },
  { name: "qwen2.5", description: "Qwen 2.5 — strong multilingual" },
  { name: "codellama", description: "CodeLlama — code-focused" },
];

console.log("--- Frankenbeast: Local Model Gallery ---");
console.log(`Endpoint: ${baseUrl}`);
console.log(`Prompt: "${prompt}"`);
console.log(`Models: ${models.length}`);
console.log();

interface ModelResult {
  name: string;
  description: string;
  content: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  functionCalling: boolean;
  error?: string;
}

const results: ModelResult[] = [];

for (const { name, description } of models) {
  const adapter = new OllamaAdapter({ baseUrl, model: name });

  const request: UnifiedRequest = {
    id: randomUUID(),
    provider: "local-ollama",
    model: name,
    system: "Be concise. One sentence max.",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 128,
  };

  console.log(`--- ${name} (${description}) ---`);
  const start = performance.now();

  try {
    const providerReq = adapter.transformRequest(request);
    const rawRes = await adapter.execute(providerReq);
    const unified = adapter.transformResponse(rawRes, request.id);
    const latencyMs = Math.round(performance.now() - start);

    results.push({
      name,
      description,
      content: unified.content,
      inputTokens: unified.usage.input_tokens,
      outputTokens: unified.usage.output_tokens,
      latencyMs,
      functionCalling: adapter.validateCapabilities("function_calling"),
    });

    console.log(`  Response: ${unified.content}`);
    console.log(`  Latency: ${latencyMs}ms | Tokens: ${unified.usage.input_tokens}+${unified.usage.output_tokens}`);
    console.log(`  Function calling: ${adapter.validateCapabilities("function_calling")}`);
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, description, content: null, inputTokens: 0, outputTokens: 0, latencyMs, functionCalling: false, error: message });
    console.log(`  Error: ${message}`);
  }
  console.log();
}

// --- Summary table ---
console.log("=== Summary ===");
console.log("Model          | Latency  | Tokens | Func Call | Status");
console.log("---------------|----------|--------|-----------|-------");
for (const r of results) {
  const status = r.error ? `FAIL: ${r.error.slice(0, 30)}` : "OK";
  const tokens = `${r.inputTokens}+${r.outputTokens}`;
  console.log(
    `${r.name.padEnd(15)}| ${String(r.latencyMs + "ms").padEnd(9)}| ${tokens.padEnd(7)}| ${String(r.functionCalling).padEnd(10)}| ${status}`,
  );
}
```

**Step 4: Make setup script executable and commit**

```bash
chmod +x examples/patterns/local-model-gallery/setup-models.sh
git add examples/patterns/local-model-gallery/
git commit -m "feat(examples): add local-model-gallery pattern comparing Ollama models"
```

---

## Task 10: Scenario — code-review-agent

**Files:**
- Create: `examples/scenarios/code-review-agent/package.json`
- Create: `examples/scenarios/code-review-agent/src/main.ts`
- Create: `examples/scenarios/code-review-agent/README.md`

This scenario uses `FakeLlmAdapter` — no API keys needed. It demonstrates the full Beast Loop pipeline.

**Step 1: Create package.json** (no .env.example needed — uses fake LLM)

**Step 2: Create src/main.ts**

```typescript
// examples/scenarios/code-review-agent/src/main.ts
//
// Full Beast Loop scenario: submit code for review through the entire
// Frankenbeast guardrail pipeline using FakeLlmAdapter (no API keys needed).
//

// NOTE: This example imports from the orchestrator's test helpers and
// internal modules. In a real deployment you'd wire real adapters.
// This is intentionally self-contained for demonstration purposes.

import { FakeLlmAdapter } from "../../../franken-orchestrator/tests/helpers/fake-llm-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import type { UnifiedResponse } from "../../../frankenfirewall/src/types/unified-response.js";
import { randomUUID } from "node:crypto";

// --- Fake LLM with pattern-matched responses ---

const fakeLlm = new FakeLlmAdapter({
  patterns: [
    {
      match: /plan|review|analyze/i,
      response: JSON.stringify({
        tasks: [
          { id: "t1", description: "Check for SQL injection vulnerabilities" },
          { id: "t2", description: "Verify input validation on user fields" },
          { id: "t3", description: "Review authentication middleware chain" },
        ],
      }),
    },
    {
      match: /critique|evaluate/i,
      response: JSON.stringify({
        verdict: "pass",
        score: 0.85,
        rationale: "Plan covers OWASP top 3 concerns. Sufficient for initial review.",
      }),
    },
    {
      match: /SQL injection/i,
      response: "Found parameterized queries in all database calls. No SQL injection risk detected.",
    },
    {
      match: /input validation/i,
      response: "User email field uses regex validation. Password has minimum length check. Missing: phone number format validation.",
    },
    {
      match: /authentication/i,
      response: "JWT middleware correctly validates tokens. Session expiry set to 24h. Recommendation: add refresh token rotation.",
    },
  ],
  defaultResponse: "No issues found.",
});

// --- Simulate the Beast Loop phases ---

console.log("=== Frankenbeast: Code Review Agent ===");
console.log("(Using FakeLlmAdapter — no API keys needed)");
console.log();

const userCode = `
// user-registration.js
app.post('/register', async (req, res) => {
  const { email, password, phone } = req.body;
  const user = await db.query('INSERT INTO users (email, pwd) VALUES ($1, $2)', [email, hashPassword(password)]);
  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '24h' });
  res.json({ token });
});
`;

// Phase 1: Ingestion (simulated)
console.log("--- Phase 1: Ingestion ---");
console.log("  Scanning for injection attacks...");
const hasInjection = /drop\s+table|;\s*delete|union\s+select/i.test(userCode);
console.log(`  Injection detected: ${hasInjection}`);
console.log("  PII masking: (no PII in code submission)");
console.log();

// Phase 2: Planning
console.log("--- Phase 2: Planning ---");
const planPrompt = "Create a review plan for this code. Analyze for security vulnerabilities.";
const planResponse = await fakeLlm.complete(planPrompt);
const plan = JSON.parse(planResponse);
console.log(`  Plan generated: ${plan.tasks.length} tasks`);
for (const task of plan.tasks) {
  console.log(`    [${task.id}] ${task.description}`);
}
console.log();

// Phase 2b: Critique the plan
console.log("  Critiquing plan...");
const critiqueResponse = await fakeLlm.complete("Critique and evaluate this plan.");
const critique = JSON.parse(critiqueResponse);
console.log(`  Critique verdict: ${critique.verdict} (score: ${critique.score})`);
console.log(`  Rationale: ${critique.rationale}`);
console.log();

// Phase 3: Execution (topological task order)
console.log("--- Phase 3: Execution ---");
const taskResults: Array<{ id: string; description: string; finding: string }> = [];

for (const task of plan.tasks) {
  const result = await fakeLlm.complete(task.description);
  taskResults.push({ id: task.id, description: task.description, finding: result });
  console.log(`  [${task.id}] ${task.description}`);
  console.log(`    Finding: ${result}`);
}
console.log();

// Phase 4: Closure
console.log("--- Phase 4: Closure ---");
console.log(`  Total LLM calls: ${fakeLlm.callCount}`);
console.log(`  Tasks completed: ${taskResults.length}/${plan.tasks.length}`);
console.log(`  Cost: $0.000000 (FakeLlmAdapter)`);
console.log();

console.log("=== Beast Result ===");
console.log(JSON.stringify({
  status: "complete",
  phases: {
    ingestion: { injectionDetected: hasInjection },
    planning: { taskCount: plan.tasks.length, critiqueScore: critique.score },
    execution: { tasksCompleted: taskResults.length },
    closure: { totalCalls: fakeLlm.callCount, costUsd: 0 },
  },
  findings: taskResults.map(t => ({ task: t.description, finding: t.finding })),
}, null, 2));
```

**Step 3: Create README.md and commit**

```bash
git add examples/scenarios/code-review-agent/
git commit -m "feat(examples): add code-review-agent scenario with full Beast Loop simulation"
```

---

## Task 11: Scenario — research-agent-hitl

**Files:**
- Create: `examples/scenarios/research-agent-hitl/package.json`
- Create: `examples/scenarios/research-agent-hitl/.env.example`
- Create: `examples/scenarios/research-agent-hitl/src/main.ts`
- Create: `examples/scenarios/research-agent-hitl/README.md`

**Step 1: Create package.json and .env.example**

.env.example:
```
# Uses Ollama for LLM calls (local, free)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
# Budget threshold in USD before requiring HITL approval
BUDGET_THRESHOLD=0.00
```

**Step 2: Create src/main.ts**

This demonstrates the HITL (Human-in-the-Loop) approval flow. Since Ollama costs $0, the budget threshold is set to $0 to always trigger HITL.

```typescript
// examples/scenarios/research-agent-hitl/src/main.ts
//
// Research agent that triggers HITL approval when budget threshold is crossed.
// Uses Ollama (local) so no API keys needed.
// Budget threshold is $0 to guarantee the approval prompt fires.
//

import { OllamaAdapter } from "../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const model = process.env.OLLAMA_MODEL ?? "llama3.2";
const budgetThreshold = parseFloat(process.env.BUDGET_THRESHOLD ?? "0.00");

const adapter = new OllamaAdapter({ baseUrl, model });

// --- HITL Approval Channel (CLI-based) ---

async function requestApproval(reason: string, details: Record<string, unknown>): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log();
  console.log("========================================");
  console.log("  HUMAN-IN-THE-LOOP APPROVAL REQUIRED");
  console.log("========================================");
  console.log(`Reason: ${reason}`);
  console.log(`Details: ${JSON.stringify(details, null, 2)}`);
  console.log();

  const answer = await rl.question("Approve this action? (y/n): ");
  rl.close();

  return answer.toLowerCase().startsWith("y");
}

// --- Research tasks ---

interface ResearchTask {
  id: string;
  question: string;
  requiresApproval: boolean;
}

const tasks: ResearchTask[] = [
  { id: "r1", question: "What are the main approaches to rate limiting in distributed systems?", requiresApproval: false },
  { id: "r2", question: "Compare token bucket vs sliding window rate limiting algorithms.", requiresApproval: false },
  { id: "r3", question: "Write a detailed implementation plan for a distributed rate limiter using Redis.", requiresApproval: true }, // Expensive task
];

// --- Main ---

console.log("=== Frankenbeast: Research Agent with HITL ===");
console.log(`Model: ${model} (local via Ollama)`);
console.log(`Budget threshold: $${budgetThreshold.toFixed(4)}`);
console.log(`Tasks: ${tasks.length}`);
console.log();

let totalSpend = 0;
let tasksCompleted = 0;
let tasksSkipped = 0;

for (const task of tasks) {
  console.log(`--- Task ${task.id}: ${task.question.slice(0, 60)}... ---`);

  // Budget check (simulated — Ollama is always $0, but we demonstrate the flow)
  if (task.requiresApproval || totalSpend > budgetThreshold) {
    const approved = await requestApproval("Budget threshold exceeded or high-cost task", {
      currentSpend: `$${totalSpend.toFixed(6)}`,
      threshold: `$${budgetThreshold.toFixed(6)}`,
      taskId: task.id,
      taskQuestion: task.question,
    });

    if (!approved) {
      console.log(`  SKIPPED (human denied approval)`);
      tasksSkipped++;
      console.log();
      continue;
    }
    console.log(`  APPROVED by human`);
  }

  const request: UnifiedRequest = {
    id: randomUUID(),
    provider: "local-ollama",
    model,
    system: "You are a research assistant. Be thorough but concise. Limit response to 3 paragraphs.",
    messages: [{ role: "user", content: task.question }],
    max_tokens: 512,
  };

  try {
    const providerReq = adapter.transformRequest(request);
    const rawRes = await adapter.execute(providerReq);
    const unified = adapter.transformResponse(rawRes, request.id);

    totalSpend += unified.usage.cost_usd;
    tasksCompleted++;

    console.log(`  Response: ${unified.content?.slice(0, 120)}...`);
    console.log(`  Tokens: ${unified.usage.input_tokens}+${unified.usage.output_tokens} | Cost: $${unified.usage.cost_usd.toFixed(6)}`);
  } catch (err) {
    console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log();
}

console.log("=== Summary ===");
console.log(`Tasks completed: ${tasksCompleted}`);
console.log(`Tasks skipped (denied): ${tasksSkipped}`);
console.log(`Total spend: $${totalSpend.toFixed(6)}`);
```

**Step 3: Create README.md and commit**

```bash
git add examples/scenarios/research-agent-hitl/
git commit -m "feat(examples): add research-agent-hitl scenario with CLI approval flow"
```

---

## Task 12: Scenario — privacy-first-local

**Files:**
- Create: `examples/scenarios/privacy-first-local/package.json`
- Create: `examples/scenarios/privacy-first-local/docker-compose.yml`
- Create: `examples/scenarios/privacy-first-local/src/main.ts`
- Create: `examples/scenarios/privacy-first-local/README.md`

**Step 1: Create package.json**

**Step 2: Create docker-compose.yml**

```yaml
version: "3.9"

services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]

  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - chroma-data:/chroma/chroma

volumes:
  ollama-data:
  chroma-data:
```

**Step 3: Create src/main.ts**

```typescript
// examples/scenarios/privacy-first-local/src/main.ts
//
// 100% self-hosted: Ollama + ChromaDB + Frankenbeast guardrails.
// No data leaves your network. Zero cloud API calls. Zero cost.
//

import { OllamaAdapter } from "../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { UnifiedRequest } from "../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

const ollamaUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const chromaUrl = process.env.CHROMA_URL ?? "http://localhost:8000";
const model = process.env.OLLAMA_MODEL ?? "llama3.2";

// --- PII Detection (local, deterministic — no cloud calls) ---

const PII_PATTERNS = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "phone", regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "credit_card", regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
];

function detectAndMaskPii(text: string): { masked: string; detections: string[] } {
  const detections: string[] = [];
  let masked = text;
  for (const { name, regex } of PII_PATTERNS) {
    const matches = text.match(regex);
    if (matches) {
      detections.push(`${name}: ${matches.length} instance(s)`);
      masked = masked.replace(regex, `[REDACTED_${name.toUpperCase()}]`);
    }
  }
  return { masked, detections };
}

// --- Main ---

console.log("=== Frankenbeast: Privacy-First Local Deployment ===");
console.log(`Ollama: ${ollamaUrl}`);
console.log(`ChromaDB: ${chromaUrl}`);
console.log(`Model: ${model}`);
console.log(`Cloud API calls: 0 (guaranteed)`);
console.log(`Data leaving network: NONE`);
console.log();

// Simulate a user query with PII
const userInput = `
Please analyze this customer record:
Name: John Smith
Email: john.smith@example.com
Phone: 555-123-4567
SSN: 123-45-6789
Credit Card: 4111-1111-1111-1111
Issue: Customer reports unauthorized transactions on their account.
`;

// Step 1: PII Detection & Masking
console.log("--- Step 1: PII Detection (Deterministic, Local) ---");
const { masked, detections } = detectAndMaskPii(userInput);
if (detections.length > 0) {
  console.log("  PII detected and masked:");
  for (const d of detections) console.log(`    ${d}`);
} else {
  console.log("  No PII detected.");
}
console.log();

// Step 2: Send masked input to local LLM
console.log("--- Step 2: LLM Analysis (Local Ollama) ---");
const adapter = new OllamaAdapter({ baseUrl: ollamaUrl, model });

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "local-ollama",
  model,
  system: "You are a fraud analysis assistant. Analyze the customer issue and suggest next steps. Be concise.",
  messages: [{ role: "user", content: masked }],
  max_tokens: 256,
};

try {
  console.log(`  Sending masked input to ${model}...`);
  const providerReq = adapter.transformRequest(request);
  const rawRes = await adapter.execute(providerReq);
  const unified = adapter.transformResponse(rawRes, request.id);

  console.log(`  Response: ${unified.content}`);
  console.log();
  console.log("--- Step 3: Audit Trail ---");
  console.log(`  Request ID: ${request.id}`);
  console.log(`  PII items masked: ${detections.length}`);
  console.log(`  Input tokens: ${unified.usage.input_tokens}`);
  console.log(`  Output tokens: ${unified.usage.output_tokens}`);
  console.log(`  Cost: $${unified.usage.cost_usd.toFixed(6)} (zero — local model)`);
  console.log(`  Data sent to cloud: NONE`);
  console.log(`  Model location: ${ollamaUrl} (local)`);

  // Step 3: Verify ChromaDB is reachable (optional)
  console.log();
  console.log("--- Step 4: ChromaDB Health Check ---");
  try {
    const chromaRes = await fetch(`${chromaUrl}/api/v1/heartbeat`);
    if (chromaRes.ok) {
      const heartbeat = await chromaRes.json();
      console.log(`  ChromaDB status: healthy (${JSON.stringify(heartbeat)})`);
      console.log("  Semantic memory available for embedding storage.");
    } else {
      console.log(`  ChromaDB status: unhealthy (${chromaRes.status})`);
    }
  } catch {
    console.log("  ChromaDB not reachable. Run: docker compose up -d");
  }
} catch (err) {
  console.error("Error. Is Ollama running? Try: docker compose up -d");
  console.error(err);
  process.exit(1);
}
```

**Step 4: Create README.md and commit**

Focus on enterprise privacy use case: GDPR, HIPAA, no cloud dependency, full audit trail.

```bash
git add examples/scenarios/privacy-first-local/
git commit -m "feat(examples): add privacy-first-local scenario with Docker Compose and PII masking"
```

---

## Task 13: Root examples README

**Files:**
- Create: `examples/README.md`

**Step 1: Create examples/README.md**

```markdown
# Frankenbeast Examples

Runnable examples showing how to integrate Frankenbeast guardrails with different AI LLM providers.

## Tiers

### Quickstart (start here)

| Example | Provider | API Key? | Description |
|---------|----------|----------|-------------|
| [claude-hello](quickstart/claude-hello/) | Anthropic Claude | Yes | Send one prompt through Claude with guardrail normalization |
| [openai-hello](quickstart/openai-hello/) | OpenAI GPT | Yes | Same flow with OpenAI — identical UnifiedResponse shape |
| [ollama-hello](quickstart/ollama-hello/) | Ollama (local) | No | Local model, zero cost, zero cloud |
| [custom-adapter](quickstart/custom-adapter/) | Groq (BYO) | Yes | Build your own adapter — implement IAdapter in 4 methods |

### Patterns

| Example | Providers | Description |
|---------|-----------|-------------|
| [multi-provider-fallback](patterns/multi-provider-fallback/) | All 3 | Claude → OpenAI → Ollama cascade with automatic failover |
| [cost-aware-routing](patterns/cost-aware-routing/) | All 3 | Route by complexity: simple → free, complex → premium |
| [tool-calling](patterns/tool-calling/) | Claude, OpenAI | Tool calls normalized through guardrails |
| [local-model-gallery](patterns/local-model-gallery/) | Ollama x4 | Compare Llama, Mistral, Qwen, CodeLlama side by side |

### Scenarios

| Example | API Key? | Description |
|---------|----------|-------------|
| [code-review-agent](scenarios/code-review-agent/) | No | Full Beast Loop with FakeLlmAdapter — plan, critique, execute |
| [research-agent-hitl](scenarios/research-agent-hitl/) | No | HITL approval flow with Ollama — budget gates and human approval |
| [privacy-first-local](scenarios/privacy-first-local/) | No | 100% self-hosted: Ollama + ChromaDB + PII masking, zero cloud |

### Integration

| Example | Description |
|---------|-------------|
| [openclaw-integration](openclaw-integration/) | Docker Compose wrapper for external agent with firewall proxy |

## Running an example

```bash
cd examples/quickstart/claude-hello
cp .env.example .env        # Add your API key
npx tsx src/main.ts
```

## Prerequisites

- **Node.js >= 20**
- **For local models:** [Ollama](https://ollama.com/download) installed and running
- **For cloud providers:** API keys from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/)
```

**Step 2: Commit**

```bash
git add examples/README.md
git commit -m "docs(examples): add root README with example index and run instructions"
```

---

## Task 14: Final verification

**Step 1: Verify all examples type-check**

Run: `npx tsc --noEmit -p examples/tsconfig.json`
Expected: No type errors

**Step 2: Run the custom-adapter conformance tests**

Run: `npx vitest run examples/quickstart/custom-adapter/src/groq-adapter.test.ts`
Expected: All tests pass

**Step 3: Verify no existing tests broke**

Run: `npm test` (root)
Expected: All 53 root integration tests pass

**Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore(examples): fix any type errors or test issues from final verification"
```

---

## Summary

| Task | Example | Tier | Commit message |
|------|---------|------|---------------|
| 1 | Infrastructure | — | `chore: add shared tsconfig for examples directory` |
| 2 | claude-hello | Quickstart | `feat(examples): add claude-hello quickstart` |
| 3 | openai-hello | Quickstart | `feat(examples): add openai-hello quickstart` |
| 4 | ollama-hello | Quickstart | `feat(examples): add ollama-hello quickstart with local model setup` |
| 5 | custom-adapter | Quickstart | `feat(examples): add custom-adapter quickstart with Groq IAdapter implementation` |
| 6 | multi-provider-fallback | Pattern | `feat(examples): add multi-provider-fallback pattern` |
| 7 | cost-aware-routing | Pattern | `feat(examples): add cost-aware-routing pattern with complexity-based provider selection` |
| 8 | tool-calling | Pattern | `feat(examples): add tool-calling pattern with normalized tool_calls output` |
| 9 | local-model-gallery | Pattern | `feat(examples): add local-model-gallery pattern comparing Ollama models` |
| 10 | code-review-agent | Scenario | `feat(examples): add code-review-agent scenario with full Beast Loop simulation` |
| 11 | research-agent-hitl | Scenario | `feat(examples): add research-agent-hitl scenario with CLI approval flow` |
| 12 | privacy-first-local | Scenario | `feat(examples): add privacy-first-local scenario with Docker Compose and PII masking` |
| 13 | Root README | — | `docs(examples): add root README with example index and run instructions` |
| 14 | Final verification | — | `chore(examples): fix any type errors or test issues from final verification` |

**14 tasks, ~14 commits, 10 new examples.**
