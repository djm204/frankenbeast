import { constants } from 'node:fs';
import { writeFile, open } from 'node:fs/promises';
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

export const DEFAULT_CONTEXT_SNAPSHOT_MAX_BYTES = 1024 * 1024;

export interface LoadContextOptions {
  /**
   * Maximum import size for a serialized context snapshot. The default fails
   * closed at 1 MiB to avoid resource exhaustion from untrusted or corrupted
   * resume/import files; callers that intentionally own larger snapshots must
   * opt in explicitly for that import.
   */
  readonly maxBytes?: number | undefined;
}

export class ContextSnapshotSizeError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly actualBytes: number,
    public readonly maxBytes: number,
  ) {
    super(`Context snapshot import is ${actualBytes} bytes, exceeding the configured ${maxBytes} byte limit`);
    this.name = 'ContextSnapshotSizeError';
  }
}

export class ContextSnapshotFileTypeError extends Error {
  constructor(public readonly filePath: string) {
    super('Context snapshot import path must be a regular file');
    this.name = 'ContextSnapshotFileTypeError';
  }
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

function normalizeMaxBytes(maxBytes: number | undefined): number {
  const resolved = maxBytes ?? DEFAULT_CONTEXT_SNAPSHOT_MAX_BYTES;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError('Context snapshot import maxBytes must be a positive safe integer');
  }
  return resolved;
}

/** Load context snapshot from a size-limited JSON file. */
export async function loadContext(filePath: string, options: LoadContextOptions = {}): Promise<BeastContext> {
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const raw = await readRegularFileWithinLimit(filePath, maxBytes);
  const snapshot: ContextSnapshot = JSON.parse(raw);
  return deserializeContext(snapshot);
}

async function readRegularFileWithinLimit(filePath: string, maxBytes: number): Promise<string> {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new ContextSnapshotFileTypeError(filePath);
    }
    if (stats.size > maxBytes) {
      throw new ContextSnapshotSizeError(filePath, stats.size, maxBytes);
    }

    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    let totalBytes = 0;

    while (totalBytes <= maxBytes) {
      const bytesToRead = Math.min(buffer.length, maxBytes + 1 - totalBytes);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, null);
      if (bytesRead === 0) {
        return Buffer.concat(chunks, totalBytes).toString('utf-8');
      }
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        throw new ContextSnapshotSizeError(filePath, totalBytes, maxBytes);
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }

    throw new ContextSnapshotSizeError(filePath, totalBytes, maxBytes);
  } finally {
    await handle.close();
  }
}
