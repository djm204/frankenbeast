# LLM Integration Examples — Design Document

**Date:** 2026-03-04
**Status:** Approved

## Goal

Create a comprehensive set of runnable examples showing how to integrate Frankenbeast's guardrail framework with different AI LLM providers. Examples cover the existing 3 implemented adapters (Claude, OpenAI, Ollama) with emphasis on local/open-source models for privacy-first, self-hosted scenarios.

## Organization: Layered Tiers

Examples are organized in 3 progressive tiers plus the existing openclaw-integration:

```
examples/
├── quickstart/                    # Tier 1: Minimal, copy-paste ready
│   ├── claude-hello/
│   ├── openai-hello/
│   ├── ollama-hello/
│   └── custom-adapter/
├── patterns/                      # Tier 2: Reusable integration techniques
│   ├── multi-provider-fallback/
│   ├── cost-aware-routing/
│   ├── tool-calling/
│   └── local-model-gallery/
├── scenarios/                     # Tier 3: End-to-end agent workflows
│   ├── code-review-agent/
│   ├── research-agent-hitl/
│   └── privacy-first-local/
└── openclaw-integration/          # (existing, unchanged)
```

**11 examples total** (10 new + 1 existing).

## Per-Example Conventions

Every example directory contains:

- `README.md` — What it demonstrates, prerequisites, how to run
- `package.json` — Minimal dependencies, workspace-linked to frankenbeast modules
- `src/` — Runnable TypeScript source code
- `.env.example` — Required environment variables (API keys, endpoints)

Shared conventions:
- All examples import from `@franken/firewall`, `@franken/types`, etc. via workspace links
- Every example runs with `npx tsx src/main.ts` — no build step required
- Ollama examples include `setup-ollama.sh` to pull required models
- Each example prints structured output: request ID, cost, violations, response

## Tier 1: Quickstarts

### claude-hello

Minimal ~50 LOC script that registers `ClaudeAdapter`, configures `guardrails.config.json` with `allowed_providers: ["anthropic"]`, sends one prompt through the firewall pipeline, and prints the guardrailed response with cost breakdown.

- Requires: `ANTHROPIC_API_KEY` in `.env`
- Demonstrates: adapter registration, pipeline execution, UnifiedResponse shape

### openai-hello

Same flow as claude-hello but with `OpenAIAdapter` and `OPENAI_API_KEY`. Shows the identical `UnifiedResponse` shape coming back from a different provider — proving the adapter abstraction works.

### ollama-hello

Uses `OllamaAdapter` pointing to `http://localhost:11434`. Includes `setup-ollama.sh` that pulls `llama3.2` (small, fast). No API key needed. README walks through Ollama installation. Highlights zero-cost, zero-cloud operation.

### custom-adapter

Implements a minimal `IAdapter` for a new provider (e.g., Groq or DeepSeek). Shows exactly which 4 methods to implement: `transformRequest`, `execute`, `transformResponse`, `validateCapabilities`. Extends `BaseAdapter` for retry/timeout/cost. Includes the conformance test harness to validate the adapter. README: step-by-step "add your own LLM provider."

## Tier 2: Patterns

### multi-provider-fallback

Registers Claude, OpenAI, and Ollama adapters. Implements a fallback chain: Claude (primary) → OpenAI (secondary) → Ollama (local fallback). Demonstrates adapter registry lookup, error handling per provider, cost comparison. Shows how `AdapterRegistryError` triggers the next provider in the chain.

### cost-aware-routing

Routes requests based on complexity: simple prompts → Ollama (free), complex → Claude/OpenAI. Uses `TokenBudget` from the observer module to track spend. Demonstrates the pricing table and cost-per-request calculation. Shows a decision function that picks the cheapest capable provider.

### tool-calling

Defines 2-3 simple tools (e.g., `get_weather`, `search_docs`). Sends a tool-calling request through the firewall pipeline. Shows how `UnifiedResponse.tool_calls` comes back normalized regardless of provider. Demonstrates the `DeterministicGrounder` outbound interceptor validating tool calls against the skill registry.

### local-model-gallery

Runs the same prompt through 4+ Ollama models: Llama 3.2, Mistral 7B, Qwen 2.5, CodeLlama. Compares response quality, latency, and capability support (function calling vs not). Includes `setup-models.sh` to pull all models. Shows how `validateCapabilities()` correctly reports per-model feature support.

## Tier 3: Scenarios

### code-review-agent

Full Beast Loop scenario: user submits code → firewall sanitizes → planner creates review tasks → critique evaluates plan → tasks execute → closure assembles result. Uses `FakeLlmAdapter` with pattern-matched responses (no real API key needed). Demonstrates injection scanning on code input, PII masking, critique loop iteration, observer cost tracking. Shows the complete `BeastResult` with traces and cost breakdown.

### research-agent-hitl

Research task that triggers governor approval at a budget threshold. Shows the HITL flow: governor raises approval request → CLI channel prompts user → user approves/denies → execution continues or halts. Demonstrates `BudgetTrigger`, `ApprovalGateway`, `CliChannel`. Uses real Ollama (local) so the scenario is runnable without API keys.

### privacy-first-local

100% self-hosted: Ollama for inference, in-memory stores for brain, no cloud calls. Docker Compose: Ollama + ChromaDB (semantic memory) + firewall. Demonstrates PII masking ensuring nothing leaves the local network, zero-cost operation, embedding provider for semantic search. README focuses on enterprise/privacy use cases.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Layered tiers (quickstart → patterns → scenarios) | Progressive learning curve; newcomers start simple, advanced users get full workflows |
| Workspace-linked packages | Examples use real module code, not copies; stays in sync automatically |
| `npx tsx` for execution | Zero build step friction; TypeScript runs directly |
| FakeLlmAdapter in scenarios | Scenarios runnable without API keys; deterministic output for CI |
| Ollama emphasis throughout | Matches user preference for local/open models; zero-cost testing |
| Custom adapter quickstart | Onboards contributors who want to add new providers |
| Per-example .env.example | Clear about what credentials each example needs |

## Provider Coverage Matrix

| Example | Claude | OpenAI | Ollama | Custom |
|---------|--------|--------|--------|--------|
| claude-hello | ✓ | | | |
| openai-hello | | ✓ | | |
| ollama-hello | | | ✓ | |
| custom-adapter | | | | ✓ |
| multi-provider-fallback | ✓ | ✓ | ✓ | |
| cost-aware-routing | ✓ | ✓ | ✓ | |
| tool-calling | ✓ | ✓ | ✓ | |
| local-model-gallery | | | ✓ (4+ models) | |
| code-review-agent | | | | FakeLlm |
| research-agent-hitl | | | ✓ | |
| privacy-first-local | | | ✓ | |
