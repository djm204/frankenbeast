import type { UnifiedResponse, ToolCall, GuardrailViolation } from "../../types/index.js";
import { pass, block } from "../interceptor-result.js";
import type { InterceptorResult } from "../interceptor-result.js";

export type { SkillRegistryClient } from "../skill-registry-client.js";
import type { SkillRegistryClient } from "../skill-registry-client.js";

export function groundToolCalls(
  response: UnifiedResponse,
  skillRegistry?: SkillRegistryClient,
): InterceptorResult<UnifiedResponse> {
  // No tool calls — nothing to ground
  if (response.tool_calls.length === 0) {
    return pass(response);
  }

  // No registry provided — skip grounding (logged by pipeline)
  if (!skillRegistry) {
    return pass(response);
  }

  const violations: GuardrailViolation[] = [];

  for (const toolCall of response.tool_calls) {
    if (!skillRegistry.hasSkill(toolCall.function_name)) {
      violations.push({
        code: "TOOL_NOT_GROUNDED",
        message: `Tool "${toolCall.function_name}" is not registered in the Skill Registry`,
        interceptor: "DeterministicGrounder",
        payload: { function_name: toolCall.function_name, tool_call_id: toolCall.id },
      });
      continue;
    }

    if (skillRegistry.validateArguments) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
      } catch {
        violations.push({
          code: "TOOL_NOT_GROUNDED",
          message: `Tool "${toolCall.function_name}" arguments are not valid JSON`,
          interceptor: "DeterministicGrounder",
          payload: { function_name: toolCall.function_name, raw_arguments: toolCall.arguments },
        });
        continue;
      }

      if (!skillRegistry.validateArguments(toolCall.function_name, parsedArgs)) {
        violations.push({
          code: "TOOL_NOT_GROUNDED",
          message: `Tool "${toolCall.function_name}" arguments failed schema validation`,
          interceptor: "DeterministicGrounder",
          payload: { function_name: toolCall.function_name },
        });
      }
    }
  }

  if (violations.length > 0) return block(violations);
  return pass(response);
}

// Helper to build a ToolCall with the right shape
export function makeToolCallFromResponse(tc: ToolCall): ToolCall {
  return { id: tc.id, function_name: tc.function_name, arguments: tc.arguments };
}
