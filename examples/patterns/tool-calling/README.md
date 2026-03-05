# Tool Calling Through Guardrails

Demonstrates how tool/function calls flow through the Frankenbeast adapter layer and come back normalized in `UnifiedResponse.tool_calls` -- same shape regardless of whether the underlying provider is Claude or OpenAI.

## How Tool Definitions Work

Tools are defined once using the provider-agnostic `ToolDefinition` type from `frankenfirewall/src/types/unified-request.ts`:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
```

This example defines three tools:

| Tool | Purpose | Required params |
|------|---------|-----------------|
| `get_weather` | Current weather for a location | `location` |
| `search_docs` | Search internal documentation | `query` |
| `create_ticket` | Create a support ticket | `title`, `priority` |

Each adapter maps `ToolDefinition` to the provider's native format during `transformRequest()`:

- **Claude** uses `tools[].input_schema` directly (the native format aligns closely).
- **OpenAI** wraps each tool as `{ type: "function", function: { name, description, parameters } }`.

The caller never needs to know which format the provider expects -- the adapter handles the mapping.

## How UnifiedResponse Normalizes Tool Calls

When an LLM responds with tool calls, each adapter maps the provider-specific response back to the canonical `ToolCall` shape during `transformResponse()`:

```typescript
interface ToolCall {
  id: string;            // unique identifier for this call
  function_name: string; // which tool the model wants to invoke
  arguments: string;     // JSON-encoded arguments string
}
```

**Claude returns** tool calls as `content` blocks with `type: "tool_use"`:
```json
{ "type": "tool_use", "id": "toolu_...", "name": "get_weather", "input": { "location": "San Francisco" } }
```

**OpenAI returns** tool calls nested in `choices[0].message.tool_calls`:
```json
{ "id": "call_...", "type": "function", "function": { "name": "get_weather", "arguments": "{\"location\":\"San Francisco\"}" } }
```

Both get normalized to the same `ToolCall` shape. The orchestrator sees:
```json
{ "id": "...", "function_name": "get_weather", "arguments": "{\"location\":\"San Francisco\"}" }
```

The `finish_reason` is set to `"tool_use"` when the model returns tool calls, regardless of provider (Claude says `"tool_use"` natively, OpenAI says `"tool_calls"` -- the adapter normalizes both).

## The Role of DeterministicGrounder

After tool calls are normalized, the DeterministicGrounder validates them before execution:

1. **Name verification** -- Does `function_name` exist in the Skill Registry? An LLM might hallucinate a tool name like `fetch_weather_data` when only `get_weather` is registered.

2. **Schema validation** -- Do the `arguments` conform to the tool's `input_schema`? A missing required field or wrong type is caught here, not at execution time.

3. **Rejection handling** -- If grounding fails, the response is returned with `finish_reason: "content_filter"` and a structured error. The hallucinated tool call never reaches execution.

This is a critical safety layer: LLMs confidently generate tool calls with nonexistent function names or malformed arguments. The guardrail catches these before they can cause damage.

## Capability Checking

Before sending a tool-equipped request, the adapter's `validateCapabilities("function_calling")` confirms the selected model supports function calling. This prevents sending tool definitions to models that would ignore them or error out.

Both Claude (Sonnet, Haiku, Opus) and OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo) support `function_calling`. The capability check is still necessary because future models or budget-tier options might not.

## Prerequisites

- Node.js 18+
- At least one of:
  - `ANTHROPIC_API_KEY` set in environment (selects Claude)
  - `OPENAI_API_KEY` set in environment (selects OpenAI)
- If both keys are set, Claude is preferred (first match wins)

## Setup

```bash
cp .env.example .env
# Edit .env with your API key (set whichever you have)
```

## Run

```bash
npm start
```

## Expected Output

```
=== Tool Calling Through Guardrails ===

Provider: Claude (claude-sonnet-4-6)
Supports function_calling: true

--- Tool Definitions ---
  get_weather
    Get the current weather for a given location. Returns temperature, conditions, and humidity.
    required params: [location]
  search_docs
    Search the internal documentation corpus for relevant articles. Returns matching document titles and snippets.
    required params: [query]
  create_ticket
    Create a support ticket in the issue tracker. Returns the new ticket ID.
    required params: [title, priority]

--- Request ---
ID:      a1b2c3d4-...
Prompt:  "What's the weather in San Francisco? Also search our docs for 'deployment guide'."
Tools:   [get_weather, search_docs, create_ticket]

--- Executing ---
Completed in 1823ms

--- Response ---
Model used:    claude-sonnet-4-6
Finish reason: tool_use
Content:       (none -- model used tools instead)

--- Usage ---
Input tokens:  385
Output tokens:  92
Cost (USD):    $0.002535

--- Normalized Tool Calls (UnifiedResponse.tool_calls) ---

  2 tool call(s) returned:

  [0] id:            toolu_01ABC...
      function_name: get_weather
      arguments:     {
            "location": "San Francisco, CA"
      }

  [1] id:            toolu_01DEF...
      function_name: search_docs
      arguments:     {
            "query": "deployment guide"
      }

--- Normalization Note ---

Provider "Claude (claude-sonnet-4-6)" returned tool calls in its native format.
The adapter's transformResponse() mapped them to the canonical shape:

  interface ToolCall {
    id: string;            // unique call identifier
    function_name: string;  // which tool the model wants to invoke
    arguments: string;      // JSON-encoded arguments string
  }

This shape is identical whether the request went to Claude, OpenAI,
or any other adapter. The orchestrator never sees provider-specific
formats -- it always receives UnifiedResponse.tool_calls[].

--- Next Step: Deterministic Grounding ---

Before executing any tool call, the DeterministicGrounder would:

  1. Verify "get_weather" exists in the Skill Registry
  2. Validate arguments against the tool's input_schema
  3. Block execution if grounding fails (finish_reason -> "content_filter")

  1. Verify "search_docs" exists in the Skill Registry
  2. Validate arguments against the tool's input_schema
  3. Block execution if grounding fails (finish_reason -> "content_filter")

This ensures no hallucinated tool names or malformed arguments
ever reach execution -- the guardrail catches them first.
```

If you set `OPENAI_API_KEY` instead, the output structure is identical -- only the provider name, model, and token counts change. The tool call shape remains the same.
