# Local Model Gallery

Compare local Ollama models side-by-side. Run the same prompt through multiple models and see how they differ in response quality, latency, token usage, and capability support. Everything runs locally -- zero cost, full privacy, no API keys required.

## Why Compare Local Models?

**Different strengths.** Not all models are equal. Some excel at reasoning, others at code generation, and others at multilingual tasks. Running the same prompt across models reveals which one fits your use case best.

**Zero cost evaluation.** Cloud model comparisons cost money per request. With Ollama, every comparison run is free. Experiment as much as you want without worrying about token budgets.

**Capability awareness.** The frankenfirewall adapter layer tracks which models support features like function calling. The gallery surfaces these differences so you can choose the right model for tool-augmented workflows.

## How It Works

1. **Gallery construction** -- Four `OllamaAdapter` instances are created, one per model. Each adapter points to the same local Ollama server but targets a different model.

2. **Sequential execution** -- The same `UnifiedRequest` is sent to each model in sequence (local models share GPU/CPU resources, so parallel execution would cause contention). For each model the example calls `transformRequest()`, `execute()`, and `transformResponse()`.

3. **Per-model metrics** -- Each run captures the response content, latency (wall clock), input/output token counts, and whether the model supports function calling (via `validateCapabilities()`).

4. **Comparison table** -- After all models have responded, a summary table ranks them by latency and highlights capability differences.

## Models

| Model | Description |
|-------|-------------|
| `llama3.2` | Meta's compact model -- strong general reasoning |
| `mistral` | Mistral AI's flagship -- fast inference, multilingual |
| `qwen2.5` | Alibaba's Qwen series -- strong at math and coding |
| `codellama` | Meta's code-specialised Llama variant -- optimised for programming tasks |

## Prerequisites

- Node.js 18+
- Ollama running locally (default: `http://localhost:11434`)
- Models pulled (see Setup)

## Setup

```bash
# Pull all 4 models (one-time setup)
bash setup-models.sh

# Or pull individually
ollama pull llama3.2
ollama pull mistral
ollama pull qwen2.5
ollama pull codellama
```

```bash
cp .env.example .env
# Edit .env if your Ollama instance is on a non-default URL
```

## Run

```bash
npm start
```

## Expected Output

```
=== Local Model Gallery ===

Compare local Ollama models side-by-side.
All models run locally -- zero cost, full privacy.

Ollama endpoint: http://localhost:11434
Models to compare (4):
  - llama3.2: Meta's latest compact model -- strong general reasoning
  - mistral: Mistral AI's flagship -- fast inference, multilingual
  - qwen2.5: Alibaba's Qwen series -- strong at math and coding
  - codellama: Meta's code-specialised Llama variant -- optimised for programming tasks

--- Prompt ---
"Explain the difference between a stack and a queue..."

--- Running: llama3.2 ---
  Latency: 1842ms
  Tokens:  47 in / 98 out
  ...

--- Running: mistral ---
  ...

=== Comparison Summary ===

Model              Latency    In Tok   Out Tok   Fn Call  Status
-----------------------------------------------------------------
llama3.2            1842ms        47        98       yes  OK
mistral             2103ms        47       112       yes  OK
qwen2.5             1956ms        47       105       yes  OK
codellama           2541ms        47        89        no  OK

--- Latency Ranking (fastest first) ---
  1. llama3.2 -- 1842ms
  2. qwen2.5 -- 1956ms
  3. mistral -- 2103ms
  4. codellama -- 2541ms

--- Function Calling Support ---
  Supported:     llama3.2, mistral, qwen2.5
  Not supported: codellama

--- Cost ---
  All models: $0.00 (local inference, zero cost)
```
