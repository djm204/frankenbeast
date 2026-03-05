/**
 * Multi-Provider Fallback Pattern
 *
 * Demonstrates a fallback chain: Claude -> OpenAI -> Ollama.
 * Builds the chain dynamically based on which environment variables are set.
 * Ollama is always available as the local fallback (zero cost, no API key needed).
 */

import { ClaudeAdapter } from "../../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import type { ClaudeAdapterConfig } from "../../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import { OpenAIAdapter } from "../../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import type { OpenAIAdapterConfig } from "../../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import { OllamaAdapter } from "../../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { OllamaAdapterConfig } from "../../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { IAdapter } from "../../../../frankenfirewall/src/adapters/i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../../../frankenfirewall/src/types/index.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Provider entry — adapter + metadata for logging and cost comparison
// ---------------------------------------------------------------------------

interface ProviderEntry {
  name: string;
  adapter: IAdapter;
  costPerInputTokenM: number;
  costPerOutputTokenM: number;
}

// ---------------------------------------------------------------------------
// Build fallback chain based on available environment variables
// ---------------------------------------------------------------------------

function buildFallbackChain(): ProviderEntry[] {
  const chain: ProviderEntry[] = [];

  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (anthropicKey) {
    const config: ClaudeAdapterConfig = {
      apiKey: anthropicKey,
      model: "claude-sonnet-4-6",
    };
    chain.push({
      name: "Claude (claude-sonnet-4-6)",
      adapter: new ClaudeAdapter(config),
      costPerInputTokenM: 3,
      costPerOutputTokenM: 15,
    });
  }

  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    const config: OpenAIAdapterConfig = {
      apiKey: openaiKey,
      model: "gpt-4o",
    };
    chain.push({
      name: "OpenAI (gpt-4o)",
      adapter: new OpenAIAdapter(config),
      costPerInputTokenM: 5,
      costPerOutputTokenM: 15,
    });
  }

  // Ollama is always available as the local fallback — no API key required
  const ollamaBaseUrl = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
  const ollamaConfig: OllamaAdapterConfig = {
    model: "llama3.2",
    baseUrl: ollamaBaseUrl,
  };
  chain.push({
    name: "Ollama (llama3.2, local)",
    adapter: new OllamaAdapter(ollamaConfig),
    costPerInputTokenM: 0,
    costPerOutputTokenM: 0,
  });

  return chain;
}

// ---------------------------------------------------------------------------
// Execute with fallback — tries each provider in order
// ---------------------------------------------------------------------------

interface FallbackResult {
  response: UnifiedResponse;
  providerUsed: string;
  attemptLog: AttemptLogEntry[];
}

interface AttemptLogEntry {
  provider: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

async function executeWithFallback(
  chain: ProviderEntry[],
  request: UnifiedRequest,
): Promise<FallbackResult> {
  const attemptLog: AttemptLogEntry[] = [];

  for (const entry of chain) {
    const start = performance.now();
    try {
      const providerRequest = entry.adapter.transformRequest(request);
      const rawResponse = await entry.adapter.execute(providerRequest);
      const unified = entry.adapter.transformResponse(rawResponse, request.id);
      const durationMs = Math.round(performance.now() - start);

      attemptLog.push({
        provider: entry.name,
        success: true,
        durationMs,
      });

      return { response: unified, providerUsed: entry.name, attemptLog };
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : String(err);

      attemptLog.push({
        provider: entry.name,
        success: false,
        error: errorMessage,
        durationMs,
      });

      console.log(`  [FAIL] ${entry.name}: ${errorMessage} (${durationMs}ms)`);
    }
  }

  throw new Error(
    `All ${chain.length} providers failed. Attempts:\n` +
      attemptLog
        .map((a) => `  - ${a.provider}: ${a.error ?? "unknown error"}`)
        .join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Cost comparison table
// ---------------------------------------------------------------------------

function printCostComparison(chain: ProviderEntry[]): void {
  console.log("--- Cost Comparison (per 1M tokens) ---");
  console.log(
    "Provider".padEnd(30) +
      "Input".padStart(10) +
      "Output".padStart(10) +
      "  Ratio",
  );
  console.log("-".repeat(62));

  // Find cheapest non-zero input cost for ratio calculation
  const nonZeroCosts = chain
    .filter((e) => e.costPerInputTokenM > 0)
    .map((e) => e.costPerInputTokenM);
  const baseCost = nonZeroCosts.length > 0 ? Math.min(...nonZeroCosts) : 1;

  for (const entry of chain) {
    const inputStr = entry.costPerInputTokenM === 0
      ? "FREE"
      : `$${entry.costPerInputTokenM.toFixed(2)}`;
    const outputStr = entry.costPerOutputTokenM === 0
      ? "FREE"
      : `$${entry.costPerOutputTokenM.toFixed(2)}`;
    const ratio = entry.costPerInputTokenM === 0
      ? "0x"
      : `${(entry.costPerInputTokenM / baseCost).toFixed(1)}x`;

    console.log(
      entry.name.padEnd(30) +
        inputStr.padStart(10) +
        outputStr.padStart(10) +
        `  ${ratio}`,
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const chain = buildFallbackChain();

console.log("=== Multi-Provider Fallback Pattern ===");
console.log();
console.log(`Fallback chain (${chain.length} providers):`);
for (let i = 0; i < chain.length; i++) {
  const arrow = i < chain.length - 1 ? " ->" : "   (final fallback)";
  console.log(`  ${i + 1}. ${chain[i]!.name}${arrow}`);
}
console.log();

printCostComparison(chain);

const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "fallback",
  model: "auto",
  system: "You are a helpful assistant. Be concise.",
  messages: [
    {
      role: "user",
      content: "What are three benefits of using a provider fallback chain? Answer in one sentence each.",
    },
  ],
  max_tokens: 512,
};

console.log("--- Request ---");
console.log(`ID:     ${request.id}`);
console.log(`Prompt: "${(request.messages[0]!.content as string)}"`);
console.log();

console.log("--- Executing Fallback Chain ---");
try {
  const result = await executeWithFallback(chain, request);

  console.log();
  console.log("--- Result ---");
  console.log(`Provider used: ${result.providerUsed}`);
  console.log(`Model:         ${result.response.model_used}`);
  console.log(`Finish reason: ${result.response.finish_reason}`);
  console.log();
  console.log("--- Content ---");
  console.log(result.response.content ?? "(no content)");
  console.log();
  console.log("--- Usage ---");
  console.log(`Input tokens:  ${result.response.usage.input_tokens}`);
  console.log(`Output tokens: ${result.response.usage.output_tokens}`);
  console.log(`Cost (USD):    $${result.response.usage.cost_usd.toFixed(6)}`);
  console.log();

  console.log("--- Attempt Log ---");
  for (const attempt of result.attemptLog) {
    const status = attempt.success ? "OK" : "FAIL";
    const detail = attempt.error ? ` (${attempt.error})` : "";
    console.log(`  [${status}] ${attempt.provider} — ${attempt.durationMs}ms${detail}`);
  }
} catch (err) {
  console.error();
  console.error("All providers failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
