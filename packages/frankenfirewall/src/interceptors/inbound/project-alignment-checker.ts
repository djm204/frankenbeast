import type { UnifiedRequest } from "../../types/index.js";
import type { GuardrailsConfig } from "../../config/index.js";
import { pass, block } from "../interceptor-result.js";
import type { InterceptorResult } from "../interceptor-result.js";
import type { GuardrailViolation } from "../../types/index.js";

// ---------------------------------------------------------------------------
// Token estimation (conservative: 1 token ≈ 4 chars)
// ---------------------------------------------------------------------------

function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4);
}

function estimateRequestTokens(request: UnifiedRequest): number {
  let chars = 0;
  if (request.system) chars += request.system.length;
  for (const msg of request.messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else {
      for (const block of msg.content) {
        if (block.text) chars += block.text.length;
        if (block.content) chars += block.content.length;
      }
    }
  }
  return estimateTokensFromChars(chars);
}

// Token cost estimate (uses a blended rate: input cost only for pre-flight)
// We default to $15/M as a conservative ceiling regardless of provider
const COST_PER_TOKEN = 15 / 1_000_000;

// ---------------------------------------------------------------------------
// Skill registry interface (MOD-02 boundary — shared definition)
// ---------------------------------------------------------------------------

export type { SkillRegistryClient } from "../skill-registry-client.js";
import type { SkillRegistryClient } from "../skill-registry-client.js";

// ---------------------------------------------------------------------------
// ProjectAlignmentChecker
// ---------------------------------------------------------------------------

export function checkProjectAlignment(
  request: UnifiedRequest,
  config: GuardrailsConfig,
  skillRegistry?: SkillRegistryClient,
): InterceptorResult {
  const violations: GuardrailViolation[] = [];

  // 1. Provider must be in allowed_providers
  if (!config.agnostic_settings.allowed_providers.includes(request.provider as "anthropic" | "openai" | "local-ollama")) {
    violations.push({
      code: "PROVIDER_NOT_ALLOWED",
      message: `Provider "${request.provider}" is not in allowed_providers`,
      interceptor: "ProjectAlignmentChecker",
      payload: {
        provider: request.provider,
        allowed: config.agnostic_settings.allowed_providers,
      },
    });
  }

  // 2. Estimated token cost must not exceed per-call budget
  const estimatedTokens = estimateRequestTokens(request);
  const estimatedCost = estimatedTokens * COST_PER_TOKEN;
  if (estimatedCost > config.agnostic_settings.max_token_spend_per_call) {
    violations.push({
      code: "BUDGET_EXCEEDED",
      message: `Estimated request cost $${estimatedCost.toFixed(6)} exceeds max_token_spend_per_call $${config.agnostic_settings.max_token_spend_per_call}`,
      interceptor: "ProjectAlignmentChecker",
      payload: {
        estimated_tokens: estimatedTokens,
        estimated_cost_usd: estimatedCost,
        ceiling_usd: config.agnostic_settings.max_token_spend_per_call,
      },
    });
  }

  // 3. Tools requested must exist in Skill Registry (if client provided)
  if (skillRegistry && request.tools) {
    for (const tool of request.tools) {
      if (!skillRegistry.hasSkill(tool.name)) {
        violations.push({
          code: "TOOL_NOT_GROUNDED",
          message: `Tool "${tool.name}" is not registered in the Skill Registry`,
          interceptor: "ProjectAlignmentChecker",
          payload: { tool_name: tool.name },
        });
      }
    }
  }

  if (violations.length > 0) return block(violations);
  return pass();
}
