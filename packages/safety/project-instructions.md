# Module 01: Policy-Driven Guardrails & AI-Agnostic Proxy (Franken Firewall)

## 1. Overview
MOD-01 is a bidirectional interceptor acting as a **Model-Agnostic Proxy (MAP)**. It decouples the AI system's core logic from specific LLM providers (Claude, GPT, local models). It treats the LLM as a non-deterministic "black box" and enforces safety, security, and structural integrity through a standardized middleware pipeline.

## 2. Architectural Pattern: The Universal Adapter
To ensure the system works with any current or future AI, MOD-01 uses a strict **Adapter Interface**. Every provider must map its proprietary format to the Frankenbeast's **Unified Schema**.

### 2.1 The Adapter Interface Contract
Any new adapter (e.g., `adapters/claude_v4.ts`) must implement these four methods:

| Method | Responsibility |
| :--- | :--- |
| `transformRequest` | Maps the Unified Schema to provider-specific API requirements (e.g., Anthropic's `system` prop vs OpenAI's `system` message). |
| `execute` | Handles transport (HTTP/gRPC), timeouts, and model-specific retry logic. |
| `transformResponse` | Normalizes raw output into the `UnifiedResponse` format (extracting content, tool calls, and usage). |
| `validateCapabilities` | Self-check for feature support (e.g., "Does this model support Function Calling?"). |



## 3. The Guardrail Pipeline
The module operates as a middleware interceptor between the Orchestrator and the Adapters.

### 3.1 Inbound Interceptors (Pre-Flight)
- **Injection Scanner:** Scans for structural intent (e.g., "Ignore previous commands") regardless of the model being used.
- **PII Masking:** Uses local NLP to redact sensitive data *before* it leaves the infrastructure.
- **Project Alignment:** Validates the request against `guardrails.config.json` to ensure the task is within the project's allowed scope.

### 3.2 Outbound Interceptors (Post-Flight)
- **Deterministic Grounding:** Verifies every tool call or file path mentioned by the AI against the **Skill Registry (MOD-02)** before execution.
- **Schema Enforcement:** Validates that the output matches the required format (e.g., JSON, TypeScript types).
- **Hallucination Scraper:** Flags dependencies or library imports that do not exist in the project's white-list.

## 4. Customization (`guardrails.config.json`)
Customization is handled via a project-level JSON file. This allows for "brutally honest" enforcement tailored to specific environments (e.g., Staples vs. GlobalVision).

```json
{
  "project_name": "Project-Alpha",
  "security_tier": "STRICT",
  "agnostic_settings": {
    "redact_pii": true,
    "max_token_spend_per_call": 0.05,
    "allowed_providers": ["anthropic", "openai", "local-ollama"]
  },
  "safety_hooks": {
    "pre_flight": ["check_injection", "validate_auth_token"],
    "post_flight": ["verify_json_schema", "check_for_ghost_deps"]
  }
}
5. Unified Response Schema (The Frankenbeast Standard)
The Guardrail ensures the Orchestrator always receives this exact shape, regardless of the provider:

JSON
{
  "id": "string",
  "model_used": "string",
  "content": "string | null",
  "tool_calls": [
    {
      "id": "string",
      "function_name": "string",
      "arguments": "JSON_string"
    }
  ],
  "finish_reason": "stop | tool_use | length | content_filter",
  "usage": {
    "input_tokens": "int",
    "output_tokens": "int",
    "cost_usd": "float"
  }
}