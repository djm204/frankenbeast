export type ViolationCode =
  | "INJECTION_DETECTED"
  | "PII_DETECTED"
  | "BUDGET_EXCEEDED"
  | "PROVIDER_NOT_ALLOWED"
  | "SCHEMA_MISMATCH"
  | "TOOL_NOT_GROUNDED"
  | "HALLUCINATION_DETECTED"
  | "ADAPTER_ERROR"
  | "CONFIG_ERROR";

export type InterceptorName =
  | "InjectionScanner"
  | "PiiMasker"
  | "ProjectAlignmentChecker"
  | "SchemaEnforcer"
  | "DeterministicGrounder"
  | "HallucinationScraper"
  | "Pipeline";

export interface GuardrailViolation {
  code: ViolationCode;
  message: string;
  interceptor: InterceptorName;
  /** Sanitized (PII-free) context payload for forensic audit */
  payload?: Record<string, unknown>;
}
