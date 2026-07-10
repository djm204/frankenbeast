import { writeFile, readFile } from 'node:fs/promises';
import { BeastContext, type AuditEntry } from '../context/franken-context.js';
import type { BeastPhase } from '../types.js';
import type { PlanGraph } from '../deps.js';
import type { TokenSpend } from '@franken/types';
import { isoNow } from '@franken/types';

/** Serializable snapshot of a BeastContext. */
export interface ContextSnapshot {
  readonly projectId: string;
  readonly sessionId: string;
  readonly userInput: string;
  readonly phase: BeastPhase;
  readonly sanitizedIntent?: {
    goal: string;
    strategy?: string | undefined;
    context?: Record<string, unknown> | undefined;
  } | undefined;
  readonly plan?: PlanGraph | undefined;
  readonly errorContext?: ReadonlyArray<SerializedError> | undefined;
  readonly circuitBreakerTripped?: boolean | undefined;
  readonly critiqueFeedback?: string | undefined;
  readonly governorApproval?: boolean | undefined;
  readonly retryCount?: number | undefined;
  readonly checkpointPath?: string | undefined;
  readonly tokenSpend: TokenSpend;
  readonly audit: readonly AuditEntry[];
  readonly savedAt: string;
}

/** JSON-safe representation of an Error retained in errorContext. */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
}

/** Serialize a BeastContext to a JSON snapshot. */
export function serializeContext(ctx: BeastContext): ContextSnapshot {
  return {
    projectId: ctx.projectId,
    sessionId: ctx.sessionId,
    userInput: ctx.userInput,
    phase: ctx.phase,
    sanitizedIntent: ctx.sanitizedIntent,
    plan: ctx.plan,
    errorContext: ctx.errorContext?.map((err) => ({
      name: err.name,
      message: err.message,
      stack: err.stack,
    })),
    circuitBreakerTripped: ctx.circuitBreakerTripped,
    critiqueFeedback: ctx.critiqueFeedback,
    governorApproval: ctx.governorApproval,
    retryCount: ctx.retryCount,
    checkpointPath: ctx.checkpointPath,
    tokenSpend: ctx.tokenSpend,
    audit: ctx.audit,
    savedAt: isoNow(),
  };
}

/** Restore a BeastContext from a snapshot. */
export function deserializeContext(snapshot: ContextSnapshot): BeastContext {
  const ctx = new BeastContext(snapshot.projectId, snapshot.sessionId, snapshot.userInput);
  ctx.phase = snapshot.phase;
  ctx.sanitizedIntent = snapshot.sanitizedIntent;
  ctx.plan = snapshot.plan;
  if (snapshot.errorContext) {
    ctx.errorContext = snapshot.errorContext.map((serialized) => {
      const err = new Error(serialized.message);
      err.name = serialized.name;
      if (serialized.stack !== undefined) {
        err.stack = serialized.stack;
      }
      return err;
    });
  }
  ctx.circuitBreakerTripped = snapshot.circuitBreakerTripped;
  ctx.critiqueFeedback = snapshot.critiqueFeedback;
  ctx.governorApproval = snapshot.governorApproval;
  ctx.retryCount = snapshot.retryCount;
  ctx.checkpointPath = snapshot.checkpointPath;
  ctx.tokenSpend = snapshot.tokenSpend;

  for (const entry of snapshot.audit) {
    ctx.audit.push(entry);
  }

  return ctx;
}

/** Save context snapshot to a file. */
export async function saveContext(ctx: BeastContext, filePath: string): Promise<void> {
  const snapshot = serializeContext(ctx);
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/** Load context snapshot from a file. */
export async function loadContext(filePath: string): Promise<BeastContext> {
  const raw = await readFile(filePath, 'utf-8');
  const snapshot: ContextSnapshot = JSON.parse(raw);
  return deserializeContext(snapshot);
}
