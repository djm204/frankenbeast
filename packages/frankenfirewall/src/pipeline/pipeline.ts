import type { UnifiedRequest, UnifiedResponse, GuardrailViolation } from "../types/index.js";
import type { GuardrailsConfig } from "../config/index.js";
import type { IAdapter } from "../adapters/index.js";
import type { SkillRegistryClient } from "../interceptors/outbound/deterministic-grounder.js";

import { scanForInjection } from "../interceptors/inbound/injection-scanner.js";
import { maskPii } from "../interceptors/inbound/pii-masker.js";
import { checkProjectAlignment } from "../interceptors/inbound/project-alignment-checker.js";
import { enforceSchema } from "../interceptors/outbound/schema-enforcer.js";
import { groundToolCalls } from "../interceptors/outbound/deterministic-grounder.js";
import { scrapeHallucinations } from "../interceptors/outbound/hallucination-scraper.js";

export interface PipelineOptions {
  skillRegistry?: SkillRegistryClient;
}

export interface PipelineResult {
  response: UnifiedResponse;
  violations: GuardrailViolation[];
}

function makeBlockedResponse(
  requestId: string,
  violations: GuardrailViolation[],
): UnifiedResponse {
  return {
    schema_version: 1,
    id: requestId,
    model_used: "guardrail",
    content: null,
    tool_calls: [],
    finish_reason: "content_filter",
    usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
  };
}

export async function runPipeline(
  request: UnifiedRequest,
  adapter: IAdapter,
  config: GuardrailsConfig,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const allViolations: GuardrailViolation[] = [];

  // -------------------------------------------------------------------------
  // INBOUND: pre-flight interceptors
  // -------------------------------------------------------------------------

  // 1. Injection scanner (operates on original request)
  const injectionResult = scanForInjection(request, config.security_tier);
  if (!injectionResult.passed) {
    allViolations.push(...injectionResult.violations);
    return { response: makeBlockedResponse(request.id, allViolations), violations: allViolations };
  }

  // 2. PII masker (produces a new, masked request)
  const piiResult = maskPii(request, config.agnostic_settings.redact_pii);
  const maskedRequest = piiResult.passed && piiResult.value ? piiResult.value : request;

  // 3. Project alignment (budget, provider, tool scope)
  const alignResult = checkProjectAlignment(maskedRequest, config, options.skillRegistry);
  if (!alignResult.passed) {
    allViolations.push(...alignResult.violations);
    return { response: makeBlockedResponse(request.id, allViolations), violations: allViolations };
  }

  // -------------------------------------------------------------------------
  // ADAPTER: transform → execute → transform
  // -------------------------------------------------------------------------

  let rawProviderResponse: unknown;
  try {
    const providerRequest = adapter.transformRequest(maskedRequest);
    rawProviderResponse = await adapter.execute(providerRequest);
  } catch (err) {
    const violation: GuardrailViolation =
      isGuardrailViolation(err)
        ? err
        : {
            code: "ADAPTER_ERROR",
            message: err instanceof Error ? err.message : String(err),
            interceptor: "Pipeline",
          };
    allViolations.push(violation);
    return { response: makeBlockedResponse(request.id, allViolations), violations: allViolations };
  }

  const unifiedResponse = adapter.transformResponse(rawProviderResponse, request.id);

  // -------------------------------------------------------------------------
  // OUTBOUND: post-flight interceptors
  // -------------------------------------------------------------------------

  // 4. Schema enforcer
  const schemaResult = enforceSchema(unifiedResponse, config.schema_version);
  if (!schemaResult.passed) {
    allViolations.push(...schemaResult.violations);
    return { response: makeBlockedResponse(request.id, allViolations), violations: allViolations };
  }
  const validatedResponse = schemaResult.value!;

  // 5. Deterministic grounding
  const groundResult = groundToolCalls(validatedResponse, options.skillRegistry);
  if (!groundResult.passed) {
    allViolations.push(...groundResult.violations);
    return { response: makeBlockedResponse(request.id, allViolations), violations: allViolations };
  }
  const groundedResponse = groundResult.value!;

  // 6. Hallucination scraper
  const whitelist = config.dependency_whitelist ?? [];
  const hallucinationResult = scrapeHallucinations(groundedResponse, whitelist);
  if (!hallucinationResult.passed) {
    allViolations.push(...hallucinationResult.violations);
    return {
      response: { ...groundedResponse, finish_reason: "content_filter" },
      violations: allViolations,
    };
  }

  return { response: groundedResponse, violations: [] };
}

function isGuardrailViolation(err: unknown): err is GuardrailViolation {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    "interceptor" in err
  );
}
