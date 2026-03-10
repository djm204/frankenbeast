import { describe, it, expectTypeOf } from "vitest";
import type { GuardrailViolation, ViolationCode, InterceptorName } from "./guardrail-violation.js";

describe("GuardrailViolation type shape", () => {
  it("has required code, message, interceptor fields", () => {
    expectTypeOf<GuardrailViolation>().toHaveProperty("code");
    expectTypeOf<GuardrailViolation>().toHaveProperty("message").toBeString();
    expectTypeOf<GuardrailViolation>().toHaveProperty("interceptor");
  });

  it("payload is optional", () => {
    expectTypeOf<GuardrailViolation["payload"]>().toEqualTypeOf<
      Record<string, unknown> | undefined
    >();
  });

  it("ViolationCode covers all expected codes", () => {
    expectTypeOf<ViolationCode>().toEqualTypeOf<
      | "INJECTION_DETECTED"
      | "PII_DETECTED"
      | "BUDGET_EXCEEDED"
      | "PROVIDER_NOT_ALLOWED"
      | "SCHEMA_MISMATCH"
      | "TOOL_NOT_GROUNDED"
      | "HALLUCINATION_DETECTED"
      | "ADAPTER_ERROR"
      | "CONFIG_ERROR"
    >();
  });

  it("InterceptorName covers all pipeline stages", () => {
    expectTypeOf<InterceptorName>().toEqualTypeOf<
      | "InjectionScanner"
      | "PiiMasker"
      | "ProjectAlignmentChecker"
      | "SchemaEnforcer"
      | "DeterministicGrounder"
      | "HallucinationScraper"
      | "Pipeline"
    >();
  });
});
