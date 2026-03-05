import { OpenAIAdapter } from "../../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import type { UnifiedRequest } from "../../../../frankenfirewall/src/types/unified-request.js";
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
