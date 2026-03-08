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
export declare class AuditLogger {
    private readonly write;
    constructor(options?: AuditLoggerOptions);
    log(entry: AuditEntry): void;
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
    }): AuditEntry;
}
//# sourceMappingURL=audit-logger.d.ts.map