# Claude Hello -- Quickstart

Send a single prompt to Claude through the Frankenbeast adapter layer and get a normalized `UnifiedResponse` back.

## Prerequisites

- Node.js >= 20
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

1. Copy the environment template and add your API key:

```bash
cp .env.example .env
# Edit .env and replace sk-ant-... with your actual key
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
npx tsx examples/quickstart/claude-hello/src/main.ts
```

## What This Demonstrates

- **ClaudeAdapter** -- The provider-specific adapter that translates between the unified interface and the Anthropic Messages API.
- **UnifiedRequest** -- The provider-agnostic request shape that all adapters accept.
- **UnifiedResponse** -- The normalized response shape returned by every adapter, including content, finish reason, and usage metrics.
- **Cost calculation** -- Automatic USD cost computation based on input/output token counts and per-model pricing.
- **Capability validation** -- Querying the adapter's capability matrix to check feature support (function calling, vision, streaming, system prompts).

## Expected Output

```
--- Frankenbeast: Claude Hello ---
Request ID: <uuid>
Model: claude-sonnet-4-6
Prompt: "Explain what a guardrail framework does in one sentence."

--- Response ---
Content: <Claude's response>
Finish reason: stop

--- Usage ---
Input tokens:  <number>
Output tokens: <number>
Cost (USD):    $<amount>

--- Capabilities ---
Function calling: true
Vision:           true
Streaming:        false
System prompt:    true
```
