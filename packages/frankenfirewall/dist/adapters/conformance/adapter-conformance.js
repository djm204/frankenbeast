import { PROVIDER_SPECIFIC_FIELDS } from "./conformance-fixtures.js";
const VALID_FINISH_REASONS = new Set([
    "stop",
    "tool_use",
    "length",
    "content_filter",
]);
const CAPABILITY_FEATURES = [
    "function_calling",
    "vision",
    "streaming",
    "system_prompt",
];
/**
 * Runs the adapter conformance suite. Tests that:
 * 1. transformRequest returns a non-null value
 * 2. transformResponse produces a valid UnifiedResponse shape
 * 3. validateCapabilities returns boolean for all features
 * 4. No provider-specific fields leak into UnifiedResponse
 * 5. Tool calls are correctly normalised
 */
export function runAdapterConformance(factory, request, fixtures) {
    const failures = [];
    const adapter = factory();
    // ── 1. transformRequest ────────────────────────────────────────────────
    try {
        const providerRequest = adapter.transformRequest(request);
        if (providerRequest == null) {
            failures.push("transformRequest returned null or undefined");
        }
    }
    catch (err) {
        failures.push(`transformRequest threw: ${String(err)}`);
    }
    // ── 2. transformResponse (text) ────────────────────────────────────────
    try {
        const unified = adapter.transformResponse(fixtures.textResponse, "req-text-001");
        validateUnifiedResponse(unified, "text", failures);
        // Text response should have content
        if (unified.content === undefined) {
            failures.push("text response: content is undefined (should be string or null)");
        }
    }
    catch (err) {
        failures.push(`transformResponse(text) threw: ${String(err)}`);
    }
    // ── 3. transformResponse (tool call) ───────────────────────────────────
    try {
        const unified = adapter.transformResponse(fixtures.toolResponse, "req-tool-001");
        validateUnifiedResponse(unified, "tool", failures);
        // Tool response should have at least one tool call
        if (unified.tool_calls.length === 0) {
            failures.push("tool response: tool_calls array is empty");
        }
        for (const tc of unified.tool_calls) {
            if (typeof tc.id !== "string" || tc.id.length === 0) {
                failures.push("tool response: tool_call.id is not a non-empty string");
            }
            if (typeof tc.function_name !== "string" || tc.function_name.length === 0) {
                failures.push("tool response: tool_call.function_name is not a non-empty string");
            }
            if (typeof tc.arguments !== "string") {
                failures.push("tool response: tool_call.arguments is not a string");
            }
        }
    }
    catch (err) {
        failures.push(`transformResponse(tool) threw: ${String(err)}`);
    }
    // ── 4. validateCapabilities ────────────────────────────────────────────
    for (const feature of CAPABILITY_FEATURES) {
        try {
            const result = adapter.validateCapabilities(feature);
            if (typeof result !== "boolean") {
                failures.push(`validateCapabilities("${feature}") returned ${typeof result}, expected boolean`);
            }
        }
        catch (err) {
            failures.push(`validateCapabilities("${feature}") threw: ${String(err)}`);
        }
    }
    return { passed: failures.length === 0, failures };
}
function validateUnifiedResponse(response, label, failures) {
    if (response.schema_version !== 1) {
        failures.push(`${label} response: schema_version is ${response.schema_version}, expected 1`);
    }
    if (typeof response.id !== "string" || response.id.length === 0) {
        failures.push(`${label} response: id is not a non-empty string`);
    }
    if (typeof response.model_used !== "string" || response.model_used.length === 0) {
        failures.push(`${label} response: model_used is not a non-empty string`);
    }
    if (!Array.isArray(response.tool_calls)) {
        failures.push(`${label} response: tool_calls is not an array`);
    }
    if (!VALID_FINISH_REASONS.has(response.finish_reason)) {
        failures.push(`${label} response: finish_reason "${response.finish_reason}" is not valid`);
    }
    // Usage metrics
    if (typeof response.usage?.input_tokens !== "number") {
        failures.push(`${label} response: usage.input_tokens is not a number`);
    }
    if (typeof response.usage?.output_tokens !== "number") {
        failures.push(`${label} response: usage.output_tokens is not a number`);
    }
    if (typeof response.usage?.cost_usd !== "number") {
        failures.push(`${label} response: usage.cost_usd is not a number`);
    }
    // No provider-specific fields should leak
    const raw = response;
    for (const field of PROVIDER_SPECIFIC_FIELDS) {
        if (field in raw) {
            failures.push(`${label} response: provider-specific field "${field}" leaked into UnifiedResponse`);
        }
    }
}
//# sourceMappingURL=adapter-conformance.js.map