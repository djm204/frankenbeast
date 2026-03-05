/**
 * Local Model Gallery Pattern
 *
 * Runs the same prompt through 4 different Ollama models and compares results.
 * All models run locally — zero cost, full privacy, no API keys needed.
 *
 * Models: llama3.2, mistral, qwen2.5, codellama
 *
 * Prerequisites:
 *   1. Ollama running locally (default: http://localhost:11434)
 *   2. Models pulled: bash setup-models.sh
 */

import { OllamaAdapter } from "../../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { OllamaAdapterConfig } from "../../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { UnifiedRequest } from "../../../../frankenfirewall/src/types/unified-request.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Model definitions — each entry describes a local model to benchmark
// ---------------------------------------------------------------------------

interface ModelEntry {
  id: string;
  description: string;
  adapter: OllamaAdapter;
}

interface ModelResult {
  model: ModelEntry;
  response: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  supportsFunctionCalling: boolean;
  error?: string;
}

function buildModelGallery(baseUrl: string): ModelEntry[] {
  const models: Array<{ id: string; description: string }> = [
    {
      id: "llama3.2",
      description: "Meta's latest compact model — strong general reasoning",
    },
    {
      id: "mistral",
      description: "Mistral AI's flagship — fast inference, multilingual",
    },
    {
      id: "qwen2.5",
      description: "Alibaba's Qwen series — strong at math and coding",
    },
    {
      id: "codellama",
      description: "Meta's code-specialised Llama variant — optimised for programming tasks",
    },
  ];

  return models.map((m) => {
    const config: OllamaAdapterConfig = { model: m.id, baseUrl };
    return {
      id: m.id,
      description: m.description,
      adapter: new OllamaAdapter(config),
    };
  });
}

// ---------------------------------------------------------------------------
// Run a single model and capture results
// ---------------------------------------------------------------------------

async function runModel(
  entry: ModelEntry,
  request: UnifiedRequest,
): Promise<ModelResult> {
  const supportsFunctionCalling = entry.adapter.validateCapabilities("function_calling");

  const start = performance.now();
  try {
    const providerRequest = entry.adapter.transformRequest(request);
    const rawResponse = await entry.adapter.execute(providerRequest);
    const unified = entry.adapter.transformResponse(rawResponse, request.id);
    const latencyMs = Math.round(performance.now() - start);

    return {
      model: entry,
      response: unified.content ?? "(no content)",
      latencyMs,
      inputTokens: unified.usage.input_tokens,
      outputTokens: unified.usage.output_tokens,
      supportsFunctionCalling,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      model: entry,
      response: "",
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      supportsFunctionCalling,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Summary comparison table
// ---------------------------------------------------------------------------

function printSummaryTable(results: ModelResult[]): void {
  console.log("=== Comparison Summary ===");
  console.log();

  const header =
    "Model".padEnd(16) +
    "Latency".padStart(10) +
    "In Tok".padStart(10) +
    "Out Tok".padStart(10) +
    "Fn Call".padStart(10) +
    "  Status";
  console.log(header);
  console.log("-".repeat(header.length + 8));

  for (const r of results) {
    const latency = r.error ? "---" : `${r.latencyMs}ms`;
    const inTok = r.error ? "---" : String(r.inputTokens);
    const outTok = r.error ? "---" : String(r.outputTokens);
    const fnCall = r.supportsFunctionCalling ? "yes" : "no";
    const status = r.error ? `FAIL: ${r.error.slice(0, 40)}` : "OK";

    console.log(
      r.model.id.padEnd(16) +
        latency.padStart(10) +
        inTok.padStart(10) +
        outTok.padStart(10) +
        fnCall.padStart(10) +
        `  ${status}`,
    );
  }

  console.log();

  // Latency ranking (successful models only)
  const successful = results.filter((r) => !r.error);
  if (successful.length > 0) {
    const sorted = [...successful].sort((a, b) => a.latencyMs - b.latencyMs);
    console.log("--- Latency Ranking (fastest first) ---");
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]!;
      console.log(`  ${i + 1}. ${r.model.id} — ${r.latencyMs}ms`);
    }
    console.log();
  }

  // Function calling support
  const withFnCalling = results.filter((r) => r.supportsFunctionCalling);
  const withoutFnCalling = results.filter((r) => !r.supportsFunctionCalling);
  console.log("--- Function Calling Support ---");
  if (withFnCalling.length > 0) {
    console.log(`  Supported:     ${withFnCalling.map((r) => r.model.id).join(", ")}`);
  }
  if (withoutFnCalling.length > 0) {
    console.log(`  Not supported: ${withoutFnCalling.map((r) => r.model.id).join(", ")}`);
  }
  console.log();

  console.log("--- Cost ---");
  console.log("  All models: $0.00 (local inference, zero cost)");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const baseUrl = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
const gallery = buildModelGallery(baseUrl);

console.log("=== Local Model Gallery ===");
console.log();
console.log("Compare local Ollama models side-by-side.");
console.log("All models run locally — zero cost, full privacy.");
console.log();

console.log(`Ollama endpoint: ${baseUrl}`);
console.log(`Models to compare (${gallery.length}):`);
for (const entry of gallery) {
  console.log(`  - ${entry.id}: ${entry.description}`);
}
console.log();

const prompt =
  "Explain the difference between a stack and a queue data structure. " +
  "Give one real-world analogy for each. Keep your answer under 100 words.";

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "ollama",
  model: "gallery",
  system: "You are a helpful assistant. Be concise and precise.",
  messages: [{ role: "user", content: prompt }],
  max_tokens: 256,
};

console.log("--- Prompt ---");
console.log(`"${prompt}"`);
console.log();

// Run all models sequentially (they share the same local GPU/CPU)
const results: ModelResult[] = [];

for (const entry of gallery) {
  console.log(`--- Running: ${entry.id} ---`);
  const result = await runModel(entry, request);

  if (result.error) {
    console.log(`  [FAIL] ${result.error}`);
  } else {
    console.log(`  Latency: ${result.latencyMs}ms`);
    console.log(`  Tokens:  ${result.inputTokens} in / ${result.outputTokens} out`);
    console.log();
    console.log(result.response);
  }
  console.log();

  results.push(result);
}

// Print the comparison summary
printSummaryTable(results);
