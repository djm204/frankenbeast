import type { TaskId } from './common.js';
import type { TokenSpend } from '@franken/types';
export type { TokenSpend };
/** A safety rule from MOD-01 (Firewall/Guardrails). */
export interface SafetyRule {
    readonly id: string;
    readonly description: string;
    readonly pattern: string;
    readonly severity: 'block' | 'warn';
}
/** Result of a sandbox execution from MOD-01. */
export interface SandboxResult {
    readonly success: boolean;
    readonly output: string;
    readonly exitCode: number;
    readonly timedOut: boolean;
}
/** A matching ADR document from MOD-03 (Brain/Memory). */
export interface ADRMatch {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly relevanceScore: number;
}
/** An episodic trace from MOD-03 (Brain/Memory). */
export interface EpisodicTrace {
    readonly taskId: TaskId;
    readonly summary: string;
    readonly outcome: 'success' | 'failure';
    readonly timestamp: string;
}
/** A lesson learned from a successful critique cycle. */
export interface CritiqueLesson {
    readonly evaluatorName: string;
    readonly failureDescription: string;
    readonly correctionApplied: string;
    readonly taskId: TaskId;
    readonly timestamp: string;
}
/** Escalation request sent to MOD-07 (Governor). */
export interface EscalationRequest {
    readonly reason: string;
    readonly iterationCount: number;
    readonly lastCritiqueResults: readonly string[];
    readonly taskId: TaskId;
    readonly sessionId: string;
}
/** What MOD-06 needs from MOD-01 (Firewall/Guardrails). */
export interface GuardrailsPort {
    getSafetyRules(): Promise<readonly SafetyRule[]>;
    executeSandbox(code: string, timeout: number): Promise<SandboxResult>;
}
/** What MOD-06 needs from MOD-03 (Brain/Memory). */
export interface MemoryPort {
    searchADRs(query: string, topK: number): Promise<readonly ADRMatch[]>;
    searchEpisodic(taskId: TaskId): Promise<readonly EpisodicTrace[]>;
    recordLesson(lesson: CritiqueLesson): Promise<void>;
}
/** What MOD-06 needs from MOD-05 (Observer). */
export interface ObservabilityPort {
    getTokenSpend(sessionId: string): Promise<TokenSpend>;
}
/** What MOD-06 emits to MOD-07 (Governor). */
export interface EscalationPort {
    requestHumanReview(request: EscalationRequest): Promise<void>;
}
//# sourceMappingURL=contracts.d.ts.map