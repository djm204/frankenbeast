import type { TokenSpend } from '@franken/types';
import type { BeastPhase } from '../types.js';
import type { PlanGraph } from '../deps.js';
import { isoNow, wallClockNow } from '@franken/types';

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
  errorContext?: Error[] | undefined;
  circuitBreakerTripped?: boolean | undefined;
  critiqueFeedback?: string | undefined;
  governorApproval?: boolean | undefined;
  retryCount?: number | undefined;
  checkpointPath?: string | undefined;
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
    this.startTime = wallClockNow();
  }

  /** Append an audit entry. */
  addAudit(module: string, action: string, detail: unknown): void {
    this.audit.push({
      timestamp: isoNow(),
      module,
      action,
      detail,
    });
  }

  /** Elapsed time since context creation. */
  elapsedMs(): number {
    return wallClockNow() - this.startTime;
  }
}
