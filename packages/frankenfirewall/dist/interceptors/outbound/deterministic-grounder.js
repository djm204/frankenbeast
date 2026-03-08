import { pass, block } from "../interceptor-result.js";
export function groundToolCalls(response, skillRegistry) {
    // No tool calls — nothing to ground
    if (response.tool_calls.length === 0) {
        return pass(response);
    }
    // No registry provided — skip grounding (logged by pipeline)
    if (!skillRegistry) {
        return pass(response);
    }
    const violations = [];
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
            let parsedArgs;
            try {
                parsedArgs = JSON.parse(toolCall.arguments);
            }
            catch {
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
    if (violations.length > 0)
        return block(violations);
    return pass(response);
}
// Helper to build a ToolCall with the right shape
export function makeToolCallFromResponse(tc) {
    return { id: tc.id, function_name: tc.function_name, arguments: tc.arguments };
}
//# sourceMappingURL=deterministic-grounder.js.map