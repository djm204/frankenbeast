/**
 * Tool Calling Through Guardrails
 *
 * Demonstrates how tool/function calls flow through the Frankenbeast adapter
 * layer and come back normalized in UnifiedResponse.tool_calls — same shape
 * regardless of whether the underlying provider is Claude or OpenAI.
 *
 * Key points:
 *   - Tools are defined once using the ToolDefinition type
 *   - Each adapter maps ToolDefinition to its native format (transformRequest)
 *   - Each adapter maps native tool_call responses back to ToolCall (transformResponse)
 *   - The orchestrator only ever sees { id, function_name, arguments }
 */

import { ClaudeAdapter } from "../../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import type { ClaudeAdapterConfig } from "../../../../frankenfirewall/src/adapters/claude/claude-adapter.js";
import { OpenAIAdapter } from "../../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import type { OpenAIAdapterConfig } from "../../../../frankenfirewall/src/adapters/openai/openai-adapter.js";
import type { IAdapter } from "../../../../frankenfirewall/src/adapters/i-adapter.js";
import type {
  UnifiedRequest,
  ToolDefinition,
} from "../../../../frankenfirewall/src/types/unified-request.js";
import type {
  UnifiedResponse,
  ToolCall,
} from "../../../../frankenfirewall/src/types/unified-response.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Tool definitions — provider-agnostic, defined once, used everywhere
// ---------------------------------------------------------------------------

const TOOLS: ToolDefinition[] = [
  {
    name: "get_weather",
    description:
      "Get the current weather for a given location. Returns temperature, conditions, and humidity.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City and state/country, e.g. 'San Francisco, CA'",
        },
        units: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature units. Defaults to fahrenheit.",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "search_docs",
    description:
      "Search the internal documentation corpus for relevant articles. Returns matching document titles and snippets.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query string",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 5.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_ticket",
    description:
      "Create a support ticket in the issue tracker. Returns the new ticket ID.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short summary of the issue",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Ticket priority level",
        },
        description: {
          type: "string",
          description: "Detailed description of the issue",
        },
      },
      required: ["title", "priority"],
    },
  },
];

// ---------------------------------------------------------------------------
// Auto-pick provider based on available API keys
// ---------------------------------------------------------------------------

interface ProviderSelection {
  name: string;
  adapter: IAdapter;
}

function selectProvider(): ProviderSelection {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (anthropicKey) {
    const config: ClaudeAdapterConfig = {
      apiKey: anthropicKey,
      model: "claude-sonnet-4-6",
    };
    return { name: "Claude (claude-sonnet-4-6)", adapter: new ClaudeAdapter(config) };
  }

  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    const config: OpenAIAdapterConfig = {
      apiKey: openaiKey,
      model: "gpt-4o",
    };
    return { name: "OpenAI (gpt-4o)", adapter: new OpenAIAdapter(config) };
  }

  console.error("ERROR: Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run this example.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pretty-print a single ToolCall
// ---------------------------------------------------------------------------

function printToolCall(tc: ToolCall, index: number): void {
  console.log(`  [${index}] id:            ${tc.id}`);
  console.log(`      function_name: ${tc.function_name}`);

  // Parse and re-format arguments for readability
  try {
    const parsed = JSON.parse(tc.arguments);
    const formatted = JSON.stringify(parsed, null, 6);
    // Indent each line of the formatted JSON to align with the label
    const indented = formatted
      .split("\n")
      .map((line, i) => (i === 0 ? line : `      ${line}`))
      .join("\n");
    console.log(`      arguments:     ${indented}`);
  } catch {
    // If arguments aren't valid JSON, print raw
    console.log(`      arguments:     ${tc.arguments}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Print the normalized shape comparison
// ---------------------------------------------------------------------------

function printNormalizationNote(providerName: string): void {
  console.log("--- Normalization Note ---");
  console.log();
  console.log(`Provider "${providerName}" returned tool calls in its native format.`);
  console.log("The adapter's transformResponse() mapped them to the canonical shape:");
  console.log();
  console.log("  interface ToolCall {");
  console.log("    id: string;            // unique call identifier");
  console.log("    function_name: string;  // which tool the model wants to invoke");
  console.log('    arguments: string;      // JSON-encoded arguments string');
  console.log("  }");
  console.log();
  console.log("This shape is identical whether the request went to Claude, OpenAI,");
  console.log("or any other adapter. The orchestrator never sees provider-specific");
  console.log("formats — it always receives UnifiedResponse.tool_calls[].");
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("=== Tool Calling Through Guardrails ===");
console.log();

// 1. Select provider
const provider = selectProvider();
console.log(`Provider: ${provider.name}`);

// 2. Verify function_calling capability
const supportsToolCalling = provider.adapter.validateCapabilities("function_calling");
console.log(`Supports function_calling: ${supportsToolCalling}`);

if (!supportsToolCalling) {
  console.error("ERROR: Selected provider does not support function_calling.");
  process.exit(1);
}

console.log();

// 3. Show tool definitions
console.log("--- Tool Definitions ---");
for (const tool of TOOLS) {
  const requiredFields = (tool.input_schema["required"] as string[]) ?? [];
  console.log(`  ${tool.name}`);
  console.log(`    ${tool.description}`);
  console.log(`    required params: [${requiredFields.join(", ")}]`);
}
console.log();

// 4. Build the request with tools
const request: UnifiedRequest = {
  id: randomUUID(),
  provider: "auto",
  model: "auto",
  system:
    "You are a helpful assistant with access to tools. " +
    "When the user asks you to do something that a tool can handle, " +
    "use the appropriate tool(s). You may call multiple tools in a single response.",
  messages: [
    {
      role: "user",
      content:
        "What's the weather in San Francisco? " +
        "Also search our docs for 'deployment guide'.",
    },
  ],
  tools: TOOLS,
  max_tokens: 1024,
};

console.log("--- Request ---");
console.log(`ID:      ${request.id}`);
console.log(`Prompt:  "${request.messages[0]!.content as string}"`);
console.log(`Tools:   [${TOOLS.map((t) => t.name).join(", ")}]`);
console.log();

// 5. Execute through the adapter pipeline
console.log("--- Executing ---");
const start = performance.now();

try {
  const providerRequest = provider.adapter.transformRequest(request);
  const rawResponse = await provider.adapter.execute(providerRequest);
  const response: UnifiedResponse = provider.adapter.transformResponse(
    rawResponse,
    request.id,
  );
  const durationMs = Math.round(performance.now() - start);

  console.log(`Completed in ${durationMs}ms`);
  console.log();

  // 6. Print response metadata
  console.log("--- Response ---");
  console.log(`Model used:    ${response.model_used}`);
  console.log(`Finish reason: ${response.finish_reason}`);
  console.log(`Content:       ${response.content ?? "(none — model used tools instead)"}`);
  console.log();

  // 7. Print usage
  console.log("--- Usage ---");
  console.log(`Input tokens:  ${response.usage.input_tokens}`);
  console.log(`Output tokens: ${response.usage.output_tokens}`);
  console.log(`Cost (USD):    $${response.usage.cost_usd.toFixed(6)}`);
  console.log();

  // 8. Print normalized tool calls
  console.log("--- Normalized Tool Calls (UnifiedResponse.tool_calls) ---");
  console.log();

  if (response.tool_calls.length === 0) {
    console.log("  (no tool calls returned)");
    console.log();
    console.log("  The model chose not to use tools for this prompt.");
    console.log("  Try a more explicit prompt or a different model.");
  } else {
    console.log(`  ${response.tool_calls.length} tool call(s) returned:`);
    console.log();

    for (let i = 0; i < response.tool_calls.length; i++) {
      printToolCall(response.tool_calls[i]!, i);
    }

    // 9. Show normalization explanation
    printNormalizationNote(provider.name);

    // 10. Show what the next step would be (DeterministicGrounder validation)
    console.log("--- Next Step: Deterministic Grounding ---");
    console.log();
    console.log("Before executing any tool call, the DeterministicGrounder would:");
    console.log();
    for (const tc of response.tool_calls) {
      console.log(`  1. Verify "${tc.function_name}" exists in the Skill Registry`);
      console.log(`  2. Validate arguments against the tool's input_schema`);
      console.log(`  3. Block execution if grounding fails (finish_reason -> "content_filter")`);
      console.log();
    }
    console.log("This ensures no hallucinated tool names or malformed arguments");
    console.log("ever reach execution — the guardrail catches them first.");
  }
} catch (err) {
  const durationMs = Math.round(performance.now() - start);
  console.error(`Failed after ${durationMs}ms`);
  console.error();
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
