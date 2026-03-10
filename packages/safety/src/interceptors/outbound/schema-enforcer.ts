import type { UnifiedResponse } from "../../types/index.js";
import type { GuardrailViolation } from "../../types/index.js";
import { pass, block } from "../interceptor-result.js";
import type { InterceptorResult } from "../interceptor-result.js";

const VALID_FINISH_REASONS = new Set(["stop", "tool_use", "length", "content_filter"]);

export function enforceSchema(
  raw: unknown,
  expectedSchemaVersion: 1 = 1,
): InterceptorResult<UnifiedResponse> {
  const violations: GuardrailViolation[] = [];

  if (typeof raw !== "object" || raw === null) {
    return block([{
      code: "SCHEMA_MISMATCH",
      message: "Response is not an object",
      interceptor: "SchemaEnforcer",
    }]);
  }

  const obj = raw as Record<string, unknown>;

  // schema_version
  if (obj["schema_version"] !== expectedSchemaVersion) {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `schema_version must be ${expectedSchemaVersion}, got ${String(obj["schema_version"])}`,
      interceptor: "SchemaEnforcer",
      payload: { field: "schema_version", received: obj["schema_version"] },
    });
  }

  // id
  if (typeof obj["id"] !== "string" || obj["id"].trim() === "") {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `"id" must be a non-empty string`,
      interceptor: "SchemaEnforcer",
      payload: { field: "id", received: obj["id"] },
    });
  }

  // model_used
  if (typeof obj["model_used"] !== "string") {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `"model_used" must be a string`,
      interceptor: "SchemaEnforcer",
      payload: { field: "model_used" },
    });
  }

  // content
  if (obj["content"] !== null && typeof obj["content"] !== "string") {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `"content" must be a string or null`,
      interceptor: "SchemaEnforcer",
      payload: { field: "content", received: typeof obj["content"] },
    });
  }

  // tool_calls
  if (!Array.isArray(obj["tool_calls"])) {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `"tool_calls" must be an array`,
      interceptor: "SchemaEnforcer",
      payload: { field: "tool_calls" },
    });
  } else {
    for (let i = 0; i < obj["tool_calls"].length; i++) {
      const tc = obj["tool_calls"][i] as Record<string, unknown> | undefined;
      if (!tc || typeof tc["function_name"] !== "string") {
        violations.push({
          code: "SCHEMA_MISMATCH",
          message: `tool_calls[${i}].function_name must be a string`,
          interceptor: "SchemaEnforcer",
          payload: { field: `tool_calls[${i}].function_name` },
        });
      }
      if (!tc || typeof tc["arguments"] !== "string") {
        violations.push({
          code: "SCHEMA_MISMATCH",
          message: `tool_calls[${i}].arguments must be a JSON string`,
          interceptor: "SchemaEnforcer",
          payload: { field: `tool_calls[${i}].arguments` },
        });
      }
    }
  }

  // finish_reason
  if (!VALID_FINISH_REASONS.has(obj["finish_reason"] as string)) {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `"finish_reason" must be one of: ${[...VALID_FINISH_REASONS].join(", ")}`,
      interceptor: "SchemaEnforcer",
      payload: { field: "finish_reason", received: obj["finish_reason"] },
    });
  }

  // usage
  const usage = obj["usage"];
  if (typeof usage !== "object" || usage === null) {
    violations.push({
      code: "SCHEMA_MISMATCH",
      message: `"usage" must be an object`,
      interceptor: "SchemaEnforcer",
      payload: { field: "usage" },
    });
  } else {
    const u = usage as Record<string, unknown>;
    if (typeof u["input_tokens"] !== "number") {
      violations.push({ code: "SCHEMA_MISMATCH", message: `"usage.input_tokens" must be a number`, interceptor: "SchemaEnforcer" });
    }
    if (typeof u["output_tokens"] !== "number") {
      violations.push({ code: "SCHEMA_MISMATCH", message: `"usage.output_tokens" must be a number`, interceptor: "SchemaEnforcer" });
    }
    if (typeof u["cost_usd"] !== "number") {
      violations.push({ code: "SCHEMA_MISMATCH", message: `"usage.cost_usd" must be a number`, interceptor: "SchemaEnforcer" });
    }
  }

  if (violations.length > 0) return block(violations);
  return pass(raw as UnifiedResponse);
}
