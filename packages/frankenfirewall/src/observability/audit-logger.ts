import type { GuardrailViolation } from "../types/index.js";

export interface AuditEntry {
  timestamp: string;
  request_id: string;
  provider: string;
  model: string;
  session_id?: string;
  interceptors_run: string[];
  violations: GuardrailViolation[];
  outcome: "pass" | "blocked";
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
}

export interface AuditLoggerOptions {
  /** Override the write sink. Defaults to process.stdout JSON lines. */
  write?: (entry: AuditEntry) => void;
}

export class AuditLogger {
  private readonly write: (entry: AuditEntry) => void;

  constructor(options: AuditLoggerOptions = {}) {
    this.write = options.write ?? ((entry) => process.stdout.write(JSON.stringify(entry) + "\n"));
  }

  log(entry: AuditEntry): void {
    this.write(entry);
  }

  buildEntry(params: {
    requestId: string;
    provider: string;
    model: string;
    sessionId?: string;
    violations: GuardrailViolation[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    startedAt: number;
  }): AuditEntry {
    const interceptors_run = [
      "InjectionScanner",
      "PiiMasker",
      "ProjectAlignmentChecker",
      ...(params.violations.length === 0
        ? ["SchemaEnforcer", "DeterministicGrounder", "HallucinationScraper"]
        : []),
    ];

    return {
      timestamp: new Date().toISOString(),
      request_id: params.requestId,
      provider: params.provider,
      model: params.model,
      ...(params.sessionId ? { session_id: params.sessionId } : {}),
      interceptors_run,
      violations: params.violations,
      outcome: params.violations.length === 0 ? "pass" : "blocked",
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: params.costUsd,
      duration_ms: Date.now() - params.startedAt,
    };
  }
}
