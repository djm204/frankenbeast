import type { TokenSpend } from '@franken/core';
import type { BeastPhase } from '../types.js';
import type { PlanGraph } from '../deps.js';

/** Audit entry recording a module action during the Beast Loop. */
export interface AuditEntry {
  readonly timestamp: string;
  readonly module: string;
  readonly action: string;
  readonly detail: unknown;
}

/**
 * Mutable context that flows through all Beast Loop phases.
 * Each phase reads and writes to this shared state.
 */
export class BeastContext {
  readonly projectId: string;
  readonly sessionId: string;
  readonly userInput: string;

  sanitizedIntent?: {
    goal: string;
    strategy?: string | undefined;
    context?: Record<string, unknown> | undefined;
  } | undefined;

  plan?: PlanGraph | undefined;
  phase: BeastPhase = 'ingestion';

  tokenSpend: TokenSpend = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  readonly audit: AuditEntry[] = [];

  private readonly startTime: number;

  constructor(projectId: string, sessionId: string, userInput: string) {
    this.projectId = projectId;
    this.sessionId = sessionId;
    this.userInput = userInput;
    this.startTime = Date.now();
  }

  /** Append an audit entry. */
  addAudit(module: string, action: string, detail: unknown): void {
    this.audit.push({
      timestamp: new Date().toISOString(),
      module,
      action,
      detail,
    });
  }

  /** Elapsed time since context creation. */
  elapsedMs(): number {
    return Date.now() - this.startTime;
  }
}
