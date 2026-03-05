# Multi-Provider Fallback Pattern

Demonstrates a fallback chain that routes requests through multiple LLM providers in priority order: Claude, OpenAI, then Ollama. If a higher-priority provider fails (network error, rate limit, missing API key), the chain automatically falls to the next provider. Ollama serves as the always-available local fallback with zero cost.

## Why Fallback Chains?

**Resilience.** Cloud APIs go down. Rate limits hit. API keys expire. A fallback chain keeps your application running by automatically routing to the next available provider.

**Graceful degradation.** When the primary provider is unavailable, the system degrades to a less capable (or slower) model rather than failing outright. A local Ollama instance ensures there is always a provider available, even offline.

**Cost awareness.** Not every request needs the most expensive model. The cost comparison output shows the price difference across providers, helping you make informed decisions about which providers to prioritize.

## How It Works

1. **Chain construction** -- The example inspects environment variables to determine which providers are available. `ANTHROPIC_API_KEY` enables Claude, `OPENAI_API_KEY` enables OpenAI, and Ollama is always included as the final fallback.

2. **Fallback execution** -- `executeWithFallback()` iterates through the chain. For each provider it calls `transformRequest()`, `execute()`, and `transformResponse()` (the standard `IAdapter` contract). If any step throws, the error is logged and the next provider is tried.

3. **Attempt logging** -- Every attempt (success or failure) is recorded with the provider name, duration, and error message. This gives full visibility into which providers were tried and why they failed.

4. **Cost comparison** -- Before execution, a table shows the per-token cost for each provider in the chain, making the cost tradeoff explicit.

## Prerequisites

- Node.js 18+
- At least one of:
  - `ANTHROPIC_API_KEY` set in environment
  - `OPENAI_API_KEY` set in environment
  - Ollama running locally (default: `http://localhost:11434`)

## Setup

```bash
cp .env.example .env
# Edit .env with your API keys (set whichever you have)
```

## Run

```bash
npm start
```

## Expected Output

```
=== Multi-Provider Fallback Pattern ===

Fallback chain (3 providers):
  1. Claude (claude-sonnet-4-6) ->
  2. OpenAI (gpt-4o) ->
  3. Ollama (llama3.2, local)   (final fallback)

--- Cost Comparison (per 1M tokens) ---
Provider                          Input    Output  Ratio
--------------------------------------------------------------
Claude (claude-sonnet-4-6)        $3.00   $15.00  1.0x
OpenAI (gpt-4o)                   $5.00   $15.00  1.7x
Ollama (llama3.2, local)           FREE     FREE  0x

--- Executing Fallback Chain ---
  [FAIL] Claude (claude-sonnet-4-6): Anthropic API error 401: ... (243ms)

--- Result ---
Provider used: OpenAI (gpt-4o)
Model:         gpt-4o-2024-08-06
...
```

If no cloud API keys are set, the chain falls through to Ollama. If Ollama is also unreachable, the example exits with a structured error listing all failed attempts.
